import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

/* =========================
   DOM ELEMENTS
========================= */
const totalAccountsEl = document.getElementById('total-accounts');
const totalScansEl = document.getElementById('total-scans');
const totalFindingsEl = document.getElementById('total-findings');
const lastScanInfoEl = document.getElementById('last-scan-info');
const accountsListEl = document.getElementById('accounts-list');
const dashboardMessageEl = document.getElementById('dashboard-message');

/* =========================
   STATE
========================= */
const dashboardState = {
  accounts: [],
  stats: {
    total_scans: 0,
    total_findings: 0,
    last_scan_status: null,
    last_scan_time: null,
  },
};

/* =========================
   STORAGE CACHE
========================= */
const CACHE_STORAGE_KEY = 'cloudConnectionStatusCache';
const safeSessionStorage = (() => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch (error) {
    // session storage unavailable
  }
  return null;
})();

let connectionStatusCache = null;

const getConnectionCacheStore = () => {
  if (connectionStatusCache) return connectionStatusCache;

  connectionStatusCache = {};
  if (!safeSessionStorage) return connectionStatusCache;

  try {
    const raw = safeSessionStorage.getItem(CACHE_STORAGE_KEY);
    connectionStatusCache = raw ? JSON.parse(raw) : {};
  } catch (error) {
    connectionStatusCache = {};
  }

  return connectionStatusCache;
};

const persistConnectionCache = () => {
  if (!safeSessionStorage || !connectionStatusCache) return;
  try {
    safeSessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(connectionStatusCache));
  } catch (error) {
    // ignore write failures
  }
};

const getCachedConnectionStatus = (accountId) => {
  if (!accountId) return null;
  const store = getConnectionCacheStore();
  return store[accountId] ?? null;
};

const setCachedConnectionStatus = (accountId, payload) => {
  if (!accountId) return;
  const store = getConnectionCacheStore();
  store[accountId] = { ...payload, cached_at: Date.now() };
  persistConnectionCache();
};

/* =========================
   UTILITY FUNCTIONS
========================= */
const escapeHtmlAttr = (value = '') => String(value).replace(/"/g, '&quot;');

const setMessage = (text = '', type = 'success') => {
  if (!dashboardMessageEl) return;
  dashboardMessageEl.textContent = text;
  dashboardMessageEl.classList.remove('success', 'error', 'info');
  if (!text) return;
  dashboardMessageEl.classList.add(type);
};

const fetchJson = async (url, options = {}) => {
  const response = await fetchWithAuth(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.detail || payload?.message || payload?.error || 'Unable to load data.';
    throw new Error(message);
  }
  return payload;
};

const statusLabel = (status) => {
  if (!status) return 'Idle';
  const normalized = status.toString().toLowerCase();
  if (normalized.includes('running') || normalized.includes('pending')) return 'Running';
  if (normalized.includes('fail') || normalized.includes('error')) return 'Failed';
  return 'Completed';
};

/* =========================
   TIME HELPERS
========================= */
function relativeTime(timestamp) {
  if (!timestamp) return 'No scans yet';

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'No scans yet';

  const diffMs = Math.max(0, Date.now() - parsed.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diffMs < minute) return 'moments ago';

  const pluralize = (value, unit) => `${value} ${unit}${value === 1 ? '' : 's'} ago`;

  if (diffMs < hour) return pluralize(Math.round(diffMs / minute), 'minute');
  if (diffMs < day) return pluralize(Math.round(diffMs / hour), 'hour');
  if (diffMs < month) return pluralize(Math.round(diffMs / day), 'day');
  if (diffMs < year) return pluralize(Math.round(diffMs / month), 'month');
  return pluralize(Math.round(diffMs / year), 'year');
}

const formatDateTime = (timestamp) => {
  if (!timestamp) return 'No scans yet';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'No scans yet';
  try {
    return parsed.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (error) {
    return parsed.toLocaleString();
  }
};

/* =========================
   STATS FUNCTIONS
========================= */
const updateStats = () => {
  const { accounts, stats } = dashboardState;

  if (totalAccountsEl) totalAccountsEl.textContent = String(accounts.length);
  if (totalScansEl) totalScansEl.textContent = String(Number(stats.total_scans) || 0);
  if (totalFindingsEl) totalFindingsEl.textContent = String(Number(stats.total_findings) || 0);

  if (!lastScanInfoEl) return;

  const label = statusLabel(stats.last_scan_status);
  const timeText = relativeTime(stats.last_scan_time);

  if (label === 'Idle' && timeText === 'No scans yet') {
    lastScanInfoEl.textContent = 'No scans yet';
    return;
  }

  if (label === 'No scans yet') {
    lastScanInfoEl.textContent = timeText;
    return;
  }

  if (timeText === 'No scans yet') {
    lastScanInfoEl.textContent = label;
    return;
  }

  lastScanInfoEl.textContent = `${label} \u2022 ${timeText}`;
};

const loadStats = async () => {
  try {
    const payload = await fetchJson(`${BASE_URL}/api/scanner/scan/stats/`);
    dashboardState.stats.total_scans = Number(payload?.total_scans) || 0;
    dashboardState.stats.total_findings = Number(payload?.total_findings) || 0;
    dashboardState.stats.last_scan_status = payload?.last_scan_status ?? null;
    dashboardState.stats.last_scan_time = payload?.last_scan_time ?? null;

    updateStats();
    return dashboardState.stats;
  } catch (error) {
    setMessage(error.message || 'Failed to load scan stats.', 'error');

    dashboardState.stats.total_scans = 0;
    dashboardState.stats.total_findings = 0;
    dashboardState.stats.last_scan_status = null;
    dashboardState.stats.last_scan_time = null;

    updateStats();
    return dashboardState.stats;
  }
};

/* =========================
   REGION HELPERS (DO NOT REMOVE)
========================= */

const normalizeRegions = (areas = []) => {
  if (!Array.isArray(areas)) return [];
  return [...new Set(areas.filter(Boolean))];
};

const extractRegionsFromStatus = (status = {}) => {
  const regionKeys = ['regions', 'available_regions', 'supported_regions', 'region_list'];
  for (const key of regionKeys) {
    const value = status[key];
    if (Array.isArray(value) && value.length) return value;
  }
  if (Array.isArray(status.region)) {
    return status.region;
  }
  if (status.region) {
    return [status.region];
  }
  return [];
};

const getRegionCandidatesForAccount = (status, account) => {
  const statusRegions = extractRegionsFromStatus(status);
  if (statusRegions.length) return statusRegions;
  return normalizeRegions(account?.regions || [account?.region]);
};

const populateRegionSelect = (select, regions = []) => {
  if (!select) return;
  const normalized = normalizeRegions(regions);
  const previousValue = select.value;
  const values = ['ALL', ...normalized];
  const options = values
    .map((regionValue) => {
      const label = regionValue === 'ALL' ? 'All regions' : regionValue;
      return `<option value="${escapeHtmlAttr(regionValue)}">${escapeHtmlAttr(label)}</option>`;
    })
    .join('');
  select.innerHTML = options;
  select.disabled = false;
  if (previousValue && values.includes(previousValue)) {
    select.value = previousValue;
  } else {
    select.value = 'ALL';
  }
};

/* =========================
   ACCOUNT RENDERING
========================= */
const checkConnectionStatus = async (accountId) => {
  try {
    const response = await fetchWithAuth(
      `${BASE_URL}/api/accounts/cloud-accounts/${accountId}/connection-status/`
    );
    const data = await response.json();
    return data;
  } catch (err) {
    return { is_connected: false, connection_issue: 'Connection check failed' };
  }
};

const createConnectionController = (account, card) => {
  const statusEl = card.querySelector('.connection-status');
  const refreshButton = card.querySelector('[data-action="refresh-connection"]');
  const runButton = card.querySelector("button[data-action='run-scan']");
  const regionSelect = card.querySelector('[data-region-select]');
  const errorBox = card.querySelector('.connection-error');
  const syncButtonState = (isConnected) => {
    if (!runButton) return;
    const hasRegionValue = Boolean(regionSelect?.value);
    if (!regionSelect || regionSelect.disabled) {
      runButton.disabled = true;
      runButton.title = 'Region configuration missing for this account.';
      return;
    }
    runButton.disabled = !isConnected || !hasRegionValue;
    if (!hasRegionValue) {
      runButton.title = 'Select a region before running a scan.';
    } else if (!isConnected) {
      runButton.title = 'Connect the cloud account before running a scan.';
    } else {
      runButton.removeAttribute('title');
    }
  };
  regionSelect?.addEventListener('change', () => {
    const connected = runButton?.dataset.connected === 'true';
    syncButtonState(connected);
  });
  if (regionSelect) {
    populateRegionSelect(regionSelect, account.regions || [account.region]);
  }
  const applyState = (result = {}, { storeCache = true } = {}) => {
    const isConnected = Boolean(result?.is_connected);
    if (statusEl) {
      statusEl.textContent = isConnected ? 'Connected' : 'Not Connected';
      statusEl.classList.remove('checking', 'connected', 'not-connected');
      statusEl.classList.add(isConnected ? 'connected' : 'not-connected');
    }
    const regionCandidates = getRegionCandidatesForAccount(result, account);
    populateRegionSelect(regionSelect, regionCandidates);
    if (errorBox) {
      if (isConnected) {
        errorBox.style.display = 'none';
      } else {
        errorBox.style.display = 'block';
        const messageEl = errorBox.querySelector('.connection-error__message');
        if (messageEl) {
          messageEl.textContent =
            result?.connection_issue || account.connection_issue || 'Unable to connect to cloud account';
        }
      }
    }
    if (runButton) {
      runButton.dataset.connected = isConnected ? 'true' : 'false';
    }
    syncButtonState(isConnected);
    if (storeCache && account?.id) {
      setCachedConnectionStatus(account.id, result);
    }
  };
  const refreshStatus = async (force = false) => {
    if (!account?.id) return null;


    if (!force) {
      const cached = getCachedConnectionStatus(account.id);
      if (cached) {
        applyState(cached, { storeCache: false });
        return cached;
      }
    }
    try {
      const fresh = await checkConnectionStatus(account.id);
      applyState(fresh);
      return fresh;
    } catch (error) {
      setMessage(error?.message || 'Unable to refresh connection status.', 'error');
      return null;
    }
  };
  refreshButton?.addEventListener('click', () => {
    // Show "Checking..." immediately before disabling button
    if (statusEl) {
      statusEl.textContent = 'Checking...';
      statusEl.classList.remove('checking', 'connected', 'not-connected');
      statusEl.classList.add('checking');
    }

    refreshButton.disabled = true;
    refreshStatus(true).finally(() => {
      refreshButton.disabled = false;
    });
  });
  if (runButton) {
    runButton.dataset.connected = 'false';
  }
  syncButtonState(false);
  return { apply: applyState, refresh: refreshStatus };
};

const matchAccountScan = (account, scan) => {
  if (!account || !scan) return false;
  if (account.id && (scan.cloud_account_id === account.id || scan.account_id === account.id)) return true;
  const normalizedAccountName = (account.account_name || '').toString().toLowerCase().trim();
  if (!normalizedAccountName) return false;
  const scanNames = [scan.cloud_account_name, scan.account_name];
  return scanNames.some((name) => name && name.toString().toLowerCase().trim() === normalizedAccountName);
};


const buildAccountCard = (account) => {
  const card = document.createElement('article');
  card.className = 'account-card';
  const accountId = account.id;
  const sanitizedAccountLabel = String(accountId ?? account.account_name ?? Date.now())
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const regionSelectId =
    `region-select-${sanitizedAccountLabel || Math.random().toString(36).slice(2, 8)}`;
  const regionMarkup = `
    <div class="region-control">
      <label class="region-label" for="${regionSelectId}">Region</label>
      <select id="${regionSelectId}" class="form-control region-select" data-region-select disabled>
        <option value="">Loading regions...</option>
      </select>
    </div>`;
  const connectionError = account.connection_issue || 'Unable to connect to cloud account';
  const providerLabel = account.provider || 'Cloud';
  const providerBadge = providerLabel.toUpperCase();
  const accountTitle = account.account_name || account.account_id || 'Unnamed account';
  const cloudAccountId = account.account_id || 'Unknown';
  let idLabel = "";
  if (providerLabel === "AWS") {
    idLabel = "Account ID";
  } else if (providerLabel === "GCP") {
    idLabel = "Project ID";
  } else if (providerLabel === "AZURE") {
    idLabel = "Subscription ID";
  } else {
    idLabel = "ID";
  }
  card.innerHTML = `
  <div class="connection-status-group">
    <button type="button" class="status-refresh" data-action="refresh-connection" aria-label="Refresh connection status" title="Refresh connection status">
      <span aria-hidden="true">&#x21bb;</span>
    </button>
    <span class="connection-status checking">Checking...</span>
  </div>
  <div class="account-card__content">
    <header class="account-card__header">
      <div class="account-title-row">
        <h4>
          ${accountTitle}
          <span class="provider-badge">${providerBadge}</span>
        </h4>
      </div>
      </header>
      <p class="account-id">${idLabel}: ${cloudAccountId}</p>
    <div class="account-card__info">
      ${regionMarkup}
    </div>
    <div class="connection-error" style="display:none;">
      <strong>Error:</strong>
      <span class="connection-error__message">${connectionError}</span>
      <p class="solution">
        Check credentials or reconnect the cloud account.
      </p>
    </div>
  </div>
  <div class="actions">
    <button
      class="btn primary"
      data-account-id="${accountId}"
      data-action="run-scan"
      data-account-name="${escapeHtmlAttr(accountTitle)}"
      data-provider="${escapeHtmlAttr(providerLabel)}"
      disabled
    >
      Run Scan
    </button>
    <button
      class="btn secondary"
      data-account-id="${accountId}"
      data-action="view-report"
      data-account-name="${escapeHtmlAttr(accountTitle)}"
      data-provider="${escapeHtmlAttr(providerLabel)}"
    >
      View Reports
    </button>
  </div>
`;
  return card;
};

const renderAccounts = () => {
  if (!accountsListEl) return;

  const headEl = document.getElementById("accounts-head");

  accountsListEl.innerHTML = '';

  // ✅ EMPTY STATE
  if (!dashboardState.accounts.length) {
    // headEl.innerHTML = `
    //   <h3>Connected cloud accounts</h3>
    // `;

    accountsListEl.innerHTML = `
  <div class="empty-state">
    <p class="empty-row">You're ready to get started 🚀</p>
    <button class="btn-primary" id="addAccountBtn">
      Add Cloud Account
    </button>
  </div>
`;

    document.getElementById("addAccountBtn").addEventListener("click", () => {
      window.location.href = "/frontend/pages/add_account.html";
    });
    return;
  }

  console.log("gfdgfdg", window.location.pathname);
  // ✅ HAS DATA
  headEl.innerHTML = `
    <h3>Connected cloud accounts</h3>
    <p>Click "Run Scan" on any account to start a fresh job.</p>
  `;

  dashboardState.accounts.forEach((account) => {
    const card = buildAccountCard(account);
    accountsListEl.appendChild(card);
    const controller = createConnectionController(account, card);
    controller.refresh();
  });
};

/* =========================
   SCAN START LOGIC
========================= */
const buildScanningPageUrl = (scan = {}) => {

  const { jobId, accountId, region, accountName, providerName } = scan;

  const params = new URLSearchParams();

  if (jobId) params.set("scan_job_id", jobId);
  if (accountId) params.set("cloud_account_id", accountId);
  if (region) params.set("region", region);
  if (accountName) params.set("account_name", accountName);
  if (providerName) params.set("provider", providerName);

  return `scanning.html?${params.toString()}`;
};

const runScan = async ({ accountId, region, accountName, providerName, button }) => {

  if (!accountId || !region) {
    setMessage('Select an account with a valid region first.', 'error');
    return;
  }

  const userConfirmed = confirm("Start a new security scan?");
  if (!userConfirmed) return;

  try {

    // disable button immediately to prevent double click
    if (button) {
      button.disabled = true;
      button.innerHTML = "Starting...";
    }

    setMessage('Starting scan job...', 'info');

    const jobId = await startScanJob(accountId, region);

    if (!jobId) {
      throw new Error("Scan job did not start");
    }

    const scanData = {
      jobId,
      accountId,
      accountName,
      providerName,
      region,
      startedAt: Date.now()
    };

    localStorage.setItem("activeScan", JSON.stringify(scanData));

    setMessage('Scan started. Redirecting...', 'success');

    window.location.href = buildScanningPageUrl(scanData);

  } catch (err) {

    console.error(err);
    setMessage(err.message || 'Failed to start scan.', 'error');

    // re-enable button if something failed
    if (button) {
      button.disabled = false;
      button.textContent = "Run Scan";
    }

  }
};
const startScanJob = async (accountId, region) => {
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/scanner/start/`, {
      method: 'POST',
      body: JSON.stringify({
        cloud_account_id: accountId,
        region: region, // "ALL" goes straight to backend, backend handles it
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.detail || payload?.error || payload?.message || 'Failed to start the scan.'
      );
    }

    const newJobId =
      payload?.scan_id || null


    if (!newJobId) {
      throw new Error('Scan start response missing job identifier.');
    }

    return newJobId;

  } catch (error) {
    setMessage(error?.message || 'Unable to start scan.', 'error');
    return null;
  }
};

/* =========================
   EVENT HANDLERS
========================= */
const handleAccountClick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  const button = event.target.closest('button[data-account-id]');
  if (!button) return;


  const action = button.dataset.action || 'run-scan';
  if (action === 'view-report') {
    const accountId = button.dataset.accountId;
    if (!accountId) return;
    const params = new URLSearchParams();
    params.set('cloud_account_id', accountId);
    if (button.dataset.accountName) {
      params.set('account_name', button.dataset.accountName);
    }
    if (button.dataset.provider) {
      params.set('provider', button.dataset.provider);
    }
    window.location.href = `report.html?${params.toString()}`;
    return;
  }
  const card = button.closest('.account-card');
  const regionSelect = card?.querySelector('[data-region-select]');
  runScan({
    accountId: button.dataset.accountId,
    region: regionSelect?.value,
    accountName: button.dataset.accountName,
    providerName: button.dataset.provider,
    button: button,
  });
};

/* =========================
   DATA LOADING
========================= */
const loadAccounts = async () => {
  try {
    const payload = await fetchJson(`${BASE_URL}/api/accounts/cloud-accounts/`, { method: 'GET' });
    dashboardState.accounts = Array.isArray(payload) ? payload : [];
    updateStats();
    return dashboardState.accounts;
  } catch (error) {
    setMessage(error.message || 'Failed to load cloud accounts.', 'error');
    dashboardState.accounts = [];
    renderAccounts();
    updateStats();
    return dashboardState.accounts;
  }
};

/* =========================
   INITIALIZATION
========================= */
const init = async () => {
  requireAuth();
  await Promise.all([loadAccounts(), loadStats()]);
  renderAccounts();
  accountsListEl?.addEventListener('click', handleAccountClick);
};
init();

