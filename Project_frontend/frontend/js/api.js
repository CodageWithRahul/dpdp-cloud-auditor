export const BASE_URL = 'http://127.0.0.1:6060';
// export const BASE_URL = 'https://dpdp-cloud-auditor.onrender.com';

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



let failureCount = 0;
const MAX_FAILURES = 3;

let backendDown = false;

const triggerBackendDown = () => {
  if (backendDown) return;
  backendDown = true;

  document.body.innerHTML = `
    <div style="
      height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      font-family:Inter, system-ui, sans-serif;
      background:#0f172a;
      color:#e2e8f0;
      text-align:center;
      padding:20px;
    ">

      <h1 style="font-size:22px; margin-bottom:10px;">
        We’re having trouble connecting
      </h1>

      <p style="max-width:420px; font-size:14px; color:#94a3b8;">
        Our servers are currently unavailable or not responding.  
        This may be temporary. Please try again in a moment.
      </p>

      <button onclick="location.reload()" style="
        margin-top:24px;
        padding:10px 18px;
        border:none;
        background:#2563eb;
        color:white;
        border-radius:8px;
        cursor:pointer;
        font-size:14px;
      ">
        Retry
      </button>

      <p style="margin-top:12px; font-size:12px; color:#64748b;">
        If the issue persists, please check your connection or try again later.
      </p>

    </div>
  `;
};;

export const fetchWithAuth = async (
  url,
  options = {},
  { retryOnUnauthorized = true } = {}
) => {
  try {
    const requestOptions = {
      ...options,
      headers: attachToken(defaultHeaders(options.headers || {})),
    };

    let response = await fetch(url, requestOptions);

    // 🔁 Token refresh logic (same as before)
    if ((response.status === 401 || response.status === 403) && retryOnUnauthorized) {
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        requestOptions.headers = attachToken(defaultHeaders(options.headers || {}));
        response = await fetch(url, requestOptions);
      } else {
        throw new Error('Session expired. Please log in again.');
      }
    }

    // ❌ Treat 5xx as backend issue
    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status}`);
    }

    // ✅ SUCCESS → reset failure count
    failureCount = 0;

    return response;

  } catch (err) {
    failureCount++;

    console.warn(`API failure (${failureCount})`, err);

    // 🚫 No internet vs backend down
    if (!navigator.onLine) {
      triggerBackendDown();
      throw new Error("No internet connection");
    }

    // 🚨 Backend down after retries
    if (failureCount >= MAX_FAILURES) {
      triggerBackendDown();
    }

    throw err;
  }
};