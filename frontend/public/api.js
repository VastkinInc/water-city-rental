/**
 * Water City Rental — shared API helper
 * Loaded by every HTML page that talks to the backend.
 * Exposes window.WCR with all API methods.
 */
(function() {
  var API_BASE = (function(){
    if (window.WCR_API_BASE) return window.WCR_API_BASE;
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    // Production: Hostinger backend
    return 'https://whitesmoke-cat-246560.hostingersite.com/api';
  })();
  // Expose globally so inline scripts (e.g., checkout.html Stripe code) can read it
  window.WCR_API_BASE = API_BASE;

  // Token storage helpers
  function getToken() {
    return localStorage.getItem('wcr_access_token');
  }
  function setToken(token) {
    if (token) localStorage.setItem('wcr_access_token', token);
  }
  function clearToken() {
    localStorage.removeItem('wcr_access_token');
    localStorage.removeItem('wcr_user');
    localStorage.removeItem('wcr_role');
  }
  function getUser() {
    var raw = localStorage.getItem('wcr_user');
    try { return raw ? JSON.parse(raw) : null; } catch(e) { return null; }
  }
  function setUser(user) {
    if (user) {
      localStorage.setItem('wcr_user', JSON.stringify(user));
      if (user.role) localStorage.setItem('wcr_role', user.role);
    }
  }

  // Generic fetch wrapper with auth
  async function apiCall(method, path, body, options) {
    options = options || {};
    var headers = options.headers || {};

    var isFormData = body instanceof FormData;
    if (!isFormData && body) headers['Content-Type'] = 'application/json';

    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var fetchOptions = {
      method: method,
      headers: headers,
      credentials: 'include'
    };

    if (body) {
      fetchOptions.body = isFormData ? body : JSON.stringify(body);
    }

    try {
      var response = await fetch(API_BASE + path, fetchOptions);
      var data;
      try { data = await response.json(); } catch(e) { data = {}; }

      if (!response.ok) {
        // Auto-clear stale credentials on 401 (except for /auth/login itself,
        // where 401 just means bad password — token was never valid).
        if (response.status === 401 && !/\/auth\/login$/.test(path)) {
          clearToken();
        }
        var err = new Error(data.message || 'Request failed');
        err.status = response.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (!err.status) err.status = 0;
      throw err;
    }
  }

  // ── Sidebar profile card hydration ─────────────────────────────────────
  // Every dashboard/portal has a sidebar profile card (avatar + name + role).
  // Those were hardcoded ("Sarah Chen" + a stock photo). This fills them from
  // the real logged-in user, the SAME source the greeting uses (getUser()).
  var ROLE_LABELS = { owner: 'Boat Owner', captain: 'Captain', customer: 'Customer', admin: 'Admin' };

  function userInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    var first = parts[0][0] || '';
    var last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (first + last).toUpperCase();
  }

  // Self-contained initials avatar — no person's stock photo, no external service.
  function initialsAvatar(name) {
    var t = userInitials(name);
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>" +
      "<rect width='80' height='80' fill='%231A1A2E'/>" +
      "<text x='50%' y='50%' dy='.35em' text-anchor='middle' " +
      "font-family='Arial,Helvetica,sans-serif' font-size='32' fill='%23FAF7F2'>" + t + "</text></svg>";
    return "data:image/svg+xml," + svg;
  }

  function hydrateSidebar() {
    var u = getUser();
    if (!u) return;
    var name = u.name || 'there';
    var roleLabel = ROLE_LABELS[u.role] || (u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : '');

    var nameEls = document.querySelectorAll('[data-user="name"]');
    for (var i = 0; i < nameEls.length; i++) nameEls[i].textContent = name;

    var firstEls = document.querySelectorAll('[data-user="firstName"]');
    for (var j = 0; j < firstEls.length; j++) firstEls[j].textContent = (name.split(' ')[0] || 'there');

    var roleEls = document.querySelectorAll('[data-user="roleLabel"]');
    for (var k = 0; k < roleEls.length; k++) if (roleLabel) roleEls[k].textContent = roleLabel;

    var imgs = document.querySelectorAll('img[data-user-avatar]');
    for (var m = 0; m < imgs.length; m++) {
      imgs[m].src = u.avatar ? u.avatar : initialsAvatar(name);
      imgs[m].alt = name;
    }
  }

  window.WCR = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    hydrateSidebar: hydrateSidebar,
    getUser: getUser,
    setUser: setUser,
    isLoggedIn: function() { return !!getToken(); },

    register: function(payload) {
      return apiCall('POST', '/auth/register', payload).then(function(r) {
        if (r.accessToken) setToken(r.accessToken);
        if (r.user) setUser(r.user);
        return r;
      });
    },
    login: function(email, password) {
      return apiCall('POST', '/auth/login', { email: email, password: password })
        .then(function(r) {
          if (r.accessToken) setToken(r.accessToken);
          if (r.user) setUser(r.user);
          return r;
        });
    },
    /**
     * Determine which login portal corresponds to a given role.
     * Used after logout to send the user back to the right portal.
     */
    getLoginPortalForRole: function(role) {
      if (!role) return '/login';
      if (role === 'admin') return '/admin-login';
      if (role === 'owner' || role === 'captain') return '/partner-login';
      return '/login';
    },

    /**
     * Centralized post-login redirect — single source of truth for
     * "where does this role go?". Pass the user object explicitly,
     * or it falls back to WCR.getUser().
     */
    redirectToDashboard: function(user) {
      var u = user || getUser();
      if (!u || !u.role) {
        if (window.parent && window.parent.location) window.parent.location.href = '/login';
        else window.location.href = '/login';
        return;
      }
      var dest;
      switch (u.role) {
        case 'customer': dest = '/dashboard/customer'; break;
        case 'owner':    dest = '/dashboard/owner';    break;
        case 'captain':  dest = '/dashboard/captain';  break;
        case 'admin':    dest = '/dashboard/admin';    break;
        default:         dest = '/login';
      }
      if (window.parent && window.parent.location) window.parent.location.href = dest;
      else window.location.href = dest;
    },

    logout: async function() {
      try {
        await fetch(API_BASE + '/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (e) { /* best effort — never block logout */ }
      try {
        localStorage.removeItem('wcr_access_token');
        localStorage.removeItem('wcr_user');
        localStorage.removeItem('wcr_role');
        localStorage.removeItem('wcr_pending_booking');
        localStorage.removeItem('wcr_post_login_redirect');
        localStorage.removeItem('wcr_pending_role');
      } catch (e) { /* private mode etc. */ }
      if (window.parent && window.parent.location) {
        window.parent.location.href = '/';
      } else {
        window.location.href = '/';
      }
    },
    me: function() {
      return apiCall('GET', '/auth/me');
    },

    listBoats: function(query) {
      var qs = query ? '?' + new URLSearchParams(query).toString() : '';
      return apiCall('GET', '/boats' + qs);
    },
    getBoat: function(id) {
      return apiCall('GET', '/boats/' + id);
    },
    updateBoat: function(id, updates) {
      return apiCall('PATCH', '/boats/' + id, updates);
    },
    deleteBoat: function(id) {
      return apiCall('DELETE', '/boats/' + id);
    },
    deleteBoatPhoto: function(boatId, publicId) {
      // publicId contains slashes (e.g. water-city-rental/boats/abc123) so it must be URL-encoded.
      return apiCall('DELETE', '/boats/' + boatId + '/photos/' + encodeURIComponent(publicId));
    },
    addBoatPhotos: async function(boatId, files) {
      // Multipart upload — bypass apiCall (which sets Content-Type: application/json).
      var fd = new FormData();
      (files || []).forEach(function(f){ fd.append('photos', f); });
      var headers = {};
      var token = getToken();
      if (token) headers['Authorization'] = 'Bearer ' + token;
      var res = await fetch(API_BASE + '/boats/' + boatId + '/photos', {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: fd
      });
      var data;
      try { data = await res.json(); } catch (e) { data = {}; }
      if (!res.ok) {
        var err = new Error(data.message || 'Upload failed');
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    listCaptains: function() {
      return apiCall('GET', '/captains');
    },
    getCaptain: function(id) {
      return apiCall('GET', '/captains/' + id);
    },

    createBooking: function(payload) {
      return apiCall('POST', '/bookings', payload);
    },
    myBookings: function() {
      return apiCall('GET', '/bookings');
    },

    // Day 5d — messaging
    listConversations: function() {
      return apiCall('GET', '/messages/conversations');
    },
    getConversation: function(bookingId) {
      return apiCall('GET', '/messages/conversations/' + bookingId);
    },
    sendMessage: function(bookingId, content) {
      return apiCall('POST', '/messages', { bookingId: bookingId, content: content });
    },
    markConversationRead: function(bookingId) {
      return apiCall('PATCH', '/messages/conversations/' + bookingId + '/read');
    },
    getUnreadCount: function() {
      return apiCall('GET', '/messages/unread-count');
    },

    updateProfile: function(updates) {
      return apiCall('PATCH', '/auth/me', updates);
    },
    changePassword: function(currentPassword, newPassword) {
      return apiCall('POST', '/auth/change-password', {
        currentPassword: currentPassword, newPassword: newPassword
      });
    },
    refreshUser: async function() {
      var resp = await apiCall('GET', '/auth/me');
      var user = resp && (resp.user || resp.data || resp);
      if (user) setUser(user);
      return user;
    },

    // Day 5e — favorites / saved boats
    toggleFavorite: function(boatId) {
      return apiCall('POST', '/auth/favorites/' + boatId);
    },
    listFavorites: function() {
      return apiCall('GET', '/auth/favorites');
    },
    checkFavorite: function(boatId) {
      return apiCall('GET', '/auth/favorites/check/' + boatId);
    },

    // Day 5f — reviews & ratings
    createReview: function(payload) {
      return apiCall('POST', '/reviews', payload);
    },
    listBoatReviews: function(boatId) {
      return apiCall('GET', '/reviews/boat/' + boatId);
    },
    listCaptainReviews: function(captainId) {
      return apiCall('GET', '/reviews/captain/' + captainId);
    },
    getBookingReview: function(bookingId) {
      return apiCall('GET', '/reviews/booking/' + bookingId);
    },
    getMyPendingReviews: function() {
      return apiCall('GET', '/reviews/my-pending');
    },

    /**
     * Unified status display for bookings (Day 4c parallel approval).
     * Takes the FULL booking object so it can read ownerApproved/captainApproved.
     * Returns { label, bg, fg } for badge rendering.
     */
    computeStatus: function(b) {
      if (!b) return { label:'—', bg:'#E5E7EB', fg:'#1F2937' };
      var s = b.status;
      if (s === 'cancelled') return { label:'CANCELLED', bg:'#FEE2E2', fg:'#991B1B' };
      if (s === 'completed') return { label:'COMPLETED', bg:'#E5E7EB', fg:'#1F2937' };
      if (s === 'needs_new_captain') return { label:'NEEDS NEW CAPTAIN', bg:'#FFEDD5', fg:'#9A3412' };
      if (s === 'confirmed') return { label:'CONFIRMED', bg:'#D1FAE5', fg:'#065F46' };
      // pending — disambiguate by which side has approved
      if (b.ownerApproved && !b.captainApproved) {
        return { label:'OWNER ✓ · CAPTAIN ⏳', bg:'#CFFAFE', fg:'#155E75' };
      }
      if (!b.ownerApproved && b.captainApproved) {
        return { label:'CAPTAIN ✓ · OWNER ⏳', bg:'#CFFAFE', fg:'#155E75' };
      }
      return { label:'PENDING', bg:'#FEF3C7', fg:'#92400E' };
    },

    _call: apiCall
  };

  // Auto-hydrate the sidebar profile card once the DOM is ready (no-op on
  // pages without a card). Pages may also call WCR.hydrateSidebar() again
  // after the user object changes (e.g. profile edit / avatar upload).
  function runHydrate() { try { hydrateSidebar(); } catch (e) { /* never block the page */ } }
  if (document.readyState !== 'loading') runHydrate();
  else document.addEventListener('DOMContentLoaded', runHydrate);

  console.log('[WCR] api.js loaded. API base:', API_BASE);
})();
