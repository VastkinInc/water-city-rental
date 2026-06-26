import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import Boat from '../models/Boat.js';
import { ApiError } from '../utils/ApiError.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../utils/tokens.js';
import { sendMail } from '../utils/mailer.js';

const GOOGLE_ROLES = ['customer', 'owner', 'captain'];

const getGoogleClient = () =>
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

// Where to send the browser after the OAuth round trip. The callback is a
// full-page redirect (not XHR), so the SPA can't read a JSON body — it picks
// the token out of the redirect URL hash instead.
const frontendBase = () =>
  process.env.FRONTEND_URL ||
  (process.env.CORS_ORIGIN || '').split(',')[0].trim() ||
  'http://localhost:5173';

const accessCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 15 * 60 * 1000
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role
});

export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (role === 'admin') {
      throw new ApiError(403, 'Admin accounts cannot be created via register');
    }

    const existing = await User.findOne({ email });
    if (existing) {
      throw new ApiError(409, 'Email already registered');
    }

    const userPayload = {
      name,
      email,
      password,
      role: role || 'customer'
    };

    // Whitelisted optional common fields
    ['phone', 'city', 'bio', 'avatar'].forEach((f) => {
      if (req.body[f] !== undefined) userPayload[f] = req.body[f];
    });

    // Owner-specific sub-document (only if role === 'owner')
    if (role === 'owner' && req.body.ownerProfile) {
      const op = req.body.ownerProfile;
      const allowed = {};
      ['harbor', 'numBoats', 'yearsOwning'].forEach((f) => {
        if (op[f] !== undefined) allowed[f] = op[f];
      });
      if (Object.keys(allowed).length) userPayload.ownerProfile = allowed;
    }

    // Captain-specific sub-document (only if role === 'captain')
    if (role === 'captain' && req.body.captainProfile) {
      const cp = req.body.captainProfile;
      const allowed = {};
      ['licenseNumber', 'yearsExperience', 'dayRate', 'hourlyRate', 'bio', 'languages']
        .forEach((f) => {
          if (cp[f] !== undefined) allowed[f] = cp[f];
        });
      if (Object.keys(allowed).length) userPayload.captainProfile = allowed;
    }

    const user = await User.create(userPayload);

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: publicUser(user),
      accessToken
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    const matches = await user.comparePassword(password);
    if (!matches) {
      throw new ApiError(401, 'Invalid credentials');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'Account deactivated');
    }

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: publicUser(user),
      accessToken
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/google — build the Google consent URL and redirect to it.
// The intended role rides along in OAuth `state` so it survives the round trip.
export const googleAuth = (req, res, next) => {
  try {
    const role = GOOGLE_ROLES.includes(req.query.role) ? req.query.role : 'customer';
    const client = getGoogleClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account',
      scope: ['openid', 'email', 'profile'],
      state: JSON.stringify({ role })
    });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/google/callback — Google redirects here with ?code&state.
// Exchange code -> verify ID token server-side -> find or create the user ->
// issue our normal JWT -> redirect back to the SPA with the token in the hash.
export const googleCallback = async (req, res, next) => {
  const FRONTEND = frontendBase();
  try {
    const { code, state } = req.query;
    if (!code) throw new ApiError(400, 'Missing authorization code');

    let intendedRole = 'customer';
    try {
      const parsed = JSON.parse(state || '{}');
      if (GOOGLE_ROLES.includes(parsed.role)) intendedRole = parsed.role;
    } catch (e) { /* keep default */ }

    const client = getGoogleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new ApiError(401, 'Google did not return an ID token');

    // SECURITY: verify the ID token signature + audience server-side.
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) throw new ApiError(401, 'Google account has no email');

    const email = String(payload.email).toLowerCase();
    const name = payload.name || email.split('@')[0];

    let user = await User.findOne({ email });
    const isNewUser = !user;

    if (isNewUser) {
      // New account. Customers are ready immediately; owners/captains must
      // finish their profile later, so flag them incomplete. intendedRole
      // (from the OAuth `state`) is honored ONLY here, on creation — it must
      // never alter the role of an account that already exists.
      user = await User.create({
        name,
        email,
        role: intendedRole,
        authProvider: 'google',
        isVerified: !!payload.email_verified,
        isProfileComplete: intendedRole === 'customer',
        ...(payload.picture ? { avatar: payload.picture } : {})
      });
    } else if (user.authProvider !== 'google') {
      // AUTO-LINK: this verified Google address already belongs to a local
      // (password) account — the same person. Record the linkage so the
      // account is Google-enabled going forward.
      //
      // SECURITY: only link when Google asserts the email is verified, so a
      // Google login can never silently adopt a pre-existing local account on
      // an unverified address.
      if (!payload.email_verified) {
        throw new ApiError(401, 'Google email is not verified — cannot link to the existing account');
      }
      // We DO NOT touch `role` — the existing account's role is authoritative
      // (intendedRole is ignored for existing users). The password hash is a
      // select:false field and is not modified here, so password sign-in keeps
      // working too; the account simply supports both methods now.
      user.authProvider = 'google';
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
      await user.save();
    }
    // Existing Google user: nothing to change — keep role and everything as-is.

    if (!user.isActive) throw new ApiError(401, 'Account deactivated');

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);
    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    // Hand the token to the SPA via the URL hash (not query) so it never lands
    // in the frontend server's access logs. A later frontend batch reads this.
    const hash = new URLSearchParams({
      token: accessToken,
      role: user.role,
      new: isNewUser ? '1' : '0'
    }).toString();
    res.redirect(`${FRONTEND}/auth/google/success#${hash}`);
  } catch (err) {
    // Browser navigation — send to login with an error flag rather than JSON.
    res.redirect(`${FRONTEND}/login?error=google`);
  }
};

export const logout = async (req, res, next) => {
  try {
    res.clearCookie('accessToken', accessCookieOptions);
    res.clearCookie('refreshToken', refreshCookieOptions);
    res.status(200).json({ success: true, message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      throw new ApiError(401, 'No refresh token provided');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Refresh token expired. Please log in again.');
      }
      throw new ApiError(401, 'Invalid refresh token');
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new ApiError(401, 'User no longer exists');
    }
    if (!user.isActive) {
      throw new ApiError(401, 'Account deactivated');
    }

    const accessToken = generateAccessToken(user._id, user.role);
    res.cookie('accessToken', accessToken, accessCookieOptions);

    res.status(200).json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
};

export const updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Whitelist top-level user fields
    const allowed = {};
    const allowedFields = ['name', 'phone', 'city', 'bio', 'avatar', 'isProfileComplete'];
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) allowed[f] = req.body[f];
    }

    // Captain-only sub-fields, addressed via dot-paths so we don't clobber
    // server-managed fields (rating, totalTrips).
    if (req.user.role === 'captain' && req.body.captainProfile) {
      const cp = req.body.captainProfile;
      const allowedCpFields = [
        'dayRate', 'hourlyRate', 'yearsExperience', 'licenseNumber', 'bio'
      ];
      for (const f of allowedCpFields) {
        if (cp[f] !== undefined) allowed[`captainProfile.${f}`] = cp[f];
      }
    }

    // Owner-only sub-fields (Batch 4B-1). Patchable by listing wizard after signup.
    if (req.user.role === 'owner' && req.body.ownerProfile) {
      const op = req.body.ownerProfile;
      const allowedOpFields = ['harbor', 'numBoats', 'yearsOwning'];
      for (const f of allowedOpFields) {
        if (op[f] !== undefined) allowed[`ownerProfile.${f}`] = op[f];
      }
    }

    // role / email / password / isVerified / isActive intentionally NOT in the
    // whitelist — silently dropped, even if present in the body.

    const user = await User.findByIdAndUpdate(
      userId,
      allowed,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) throw new ApiError(404, 'User not found');

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/avatar  (multipart, field "avatar")
// Multer+Cloudinary has already uploaded the file by the time we run; the
// resulting CDN URL is on req.file.path. Persist it to User.avatar and return
// the refreshed user so the client can update the displayed photo everywhere.
export const updateMyAvatar = async (req, res, next) => {
  try {
    if (!req.file || !req.file.path) {
      throw new ApiError(400, 'No image file received');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: req.file.path },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) throw new ApiError(404, 'User not found');

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Current password and new password are required');
    }
    if (newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters');
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, 'New password must be different from current password');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) throw new ApiError(404, 'User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new ApiError(401, 'Current password is incorrect');

    user.password = newPassword; // pre-save hook hashes
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    next(err);
  }
};

// ── Forgot / Reset Password ────────────────────────────────────────────────

// Helper: build reset email HTML
function resetEmailHtml(name, resetUrl) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:20px;margin:0 0 16px;color:#1a1a2e;">Water City Rental</h1>
      <h2 style="font-size:17px;margin:0 0 16px;color:#c4623a;">Reset Your Password</h2>
      <p style="font-size:14px;line-height:1.6;">Hi ${name || 'there'},</p>
      <p style="font-size:14px;line-height:1.6;">We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>30 minutes</strong>.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#c4623a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:6px;">Reset Password</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#6b6560;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="font-size:13px;color:#c4623a;word-break:break-all;">${resetUrl}</p>
      <p style="font-size:13px;line-height:1.6;color:#6b6560;">If you didn't request a password reset, you can safely ignore this email — your password will stay the same.</p>
      <p style="font-size:12px;color:#6b6560;margin-top:28px;border-top:1px solid #e6ddd2;padding-top:14px;">
        This is an automated message from Water City Rental. Please do not reply to this email.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * POST /api/auth/forgot-password
 * Public. Looks up the email, generates a 30-minute reset token, emails a link.
 * Always returns 200 with a generic message to prevent email enumeration.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with that email, a reset link has been sent.'
      });
    }

    // Generate a random reset token and store a hash of it on the user
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save({ validateBeforeSave: false });

    // Build the reset URL — the frontend page that will handle it
    const frontendBase =
      process.env.FRONTEND_URL ||
      (process.env.CORS_ORIGIN || '').split(',')[0].trim() ||
      'http://localhost:5173';
    const resetUrl = `${frontendBase}/reset-password?token=${rawToken}`;

    // Send the email (fire-and-forget style — never block response)
    sendMail({
      to: user.email,
      subject: 'Reset your Water City Rental password',
      html: resetEmailHtml(user.name, resetUrl)
    }).catch(() => {}); // intentionally swallowed

    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/reset-password
 * Public. Verifies the token and sets the new password.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new ApiError(400, 'Token and password are required');
    }

    // Hash the incoming token to compare with the stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      throw new ApiError(400, 'Invalid or expired reset token');
    }

    // Set the new password (pre-save hook will hash it)
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Issue fresh tokens so the user stays logged in after reset
    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      user: publicUser(user),
      accessToken
    });
  } catch (err) {
    next(err);
  }
};

export const toggleFavorite = async (req, res, next) => {
  try {
    const { boatId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(boatId)) {
      throw new ApiError(400, 'Invalid boat ID');
    }
    if (req.user.role !== 'customer') {
      throw new ApiError(403, 'Only customers can favorite boats');
    }

    const boat = await Boat.findById(boatId).select('_id');
    if (!boat) throw new ApiError(404, 'Boat not found');

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    const idx = user.favorites.findIndex((f) => f.toString() === boatId);
    let action;
    if (idx === -1) {
      user.favorites.push(boatId);
      action = 'saved';
    } else {
      user.favorites.splice(idx, 1);
      action = 'unsaved';
    }
    await user.save();

    res.status(200).json({
      success: true,
      action,
      favorited: action === 'saved',
      favoritesCount: user.favorites.length
    });
  } catch (err) {
    next(err);
  }
};

export const listFavorites = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(200).json({ success: true, data: [], count: 0 });
    }

    const user = await User.findById(req.user._id).populate({
      path: 'favorites',
      match: { status: 'active' },
      populate: [
        { path: 'owner', select: 'name avatar' },
        { path: 'recommendedCaptain', select: 'name avatar captainProfile' }
      ]
    });

    const favorites = (user?.favorites || []).filter(Boolean);

    res.status(200).json({
      success: true,
      data: favorites,
      count: favorites.length
    });
  } catch (err) {
    next(err);
  }
};

export const checkFavorite = async (req, res, next) => {
  try {
    const { boatId } = req.params;
    if (!mongoose.isValidObjectId(boatId)) {
      return res.status(200).json({ success: true, data: { favorited: false } });
    }
    if (req.user.role !== 'customer') {
      return res.status(200).json({ success: true, data: { favorited: false } });
    }

    const user = await User.findById(req.user._id).select('favorites');
    const favorited = user && user.favorites.some((f) => f.toString() === boatId);

    res.status(200).json({
      success: true,
      data: { favorited: !!favorited }
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const u = req.user;
    const payload = {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      avatar: u.avatar,
      city: u.city,
      bio: u.bio,
      isProfileComplete: u.isProfileComplete
    };
    if (u.role === 'captain' && u.captainProfile) {
      payload.captainProfile = u.captainProfile;
    }
    if (u.role === 'owner' && u.ownerProfile) {
      payload.ownerProfile = u.ownerProfile;
    }
    res.status(200).json({ success: true, user: payload });
  } catch (err) {
    next(err);
  }
};
