export const BASE_URL = 'http://127.0.0.1:6060';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = ({ access, refresh }) => {
  if (access) {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
  }
  if (refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

const refreshAccessToken = async () => {
  const refresh = getRefreshToken();
  if (!refresh) {
    clearTokens();
    return false;
  }

  const response = await fetch(`${BASE_URL}/api/accounts/token/refresh/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access) {
    clearTokens();
    return false;
  }

  setTokens({ access: payload.access, refresh: payload.refresh || refresh });
  return true;
};

export const requireAuth = () => {
  if (!getAccessToken()) {
    clearTokens();
    window.location.href = 'login.html';
  }
};

const attachToken = (headers = {}) => {
  const token = getAccessToken();
  if (token) {
    return {
      ...headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return headers;
};

const defaultHeaders = (options = {}) => ({
  'Content-Type': 'application/json',
  ...options,
});

export const fetchWithAuth = async (url, options = {}, { retryOnUnauthorized = true } = {}) => {
  const requestOptions = {
    ...options,
    headers: attachToken(defaultHeaders(options.headers || {})),
  };

  let response = await fetch(url, requestOptions);

  if ((response.status === 401 || response.status === 403) && retryOnUnauthorized) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      requestOptions.headers = attachToken(defaultHeaders(options.headers || {}));
      response = await fetch(url, requestOptions);
    } else {
      throw new Error('Session expired. Please log in again.');
    }
  }

  return response;
};
