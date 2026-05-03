/**
 * Water City Rental — shared API helper
 * Loaded by every HTML page that talks to the backend.
 * Exposes window.WCR with all API methods.
 */
(function() {
  var API_BASE = 'http://localhost:5000/api';

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

  window.WCR = {
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
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
    logout: function() {
      return apiCall('POST', '/auth/logout', null).finally(clearToken);
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

    _call: apiCall
  };

  console.log('[WCR] api.js loaded. API base:', API_BASE);
})();
