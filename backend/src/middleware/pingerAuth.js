import { ApiError } from '../utils/ApiError.js';

// Server-to-server shared-secret auth for the /api/internal/* endpoints
// hit by the external pinger (cron-job.org or similar). Not user auth.
// The real value lives in env (PINGER_SECRET) — keep this out of git.
export const requirePingerSecret = (req, _res, next) => {
  const expected = process.env.PINGER_SECRET;
  if (!expected) {
    return next(new ApiError(500, 'PINGER_SECRET not configured on server'));
  }
  const got = req.headers['x-pinger-secret'];
  if (!got || got !== expected) {
    return next(new ApiError(401, 'Unauthorized'));
  }
  next();
};
