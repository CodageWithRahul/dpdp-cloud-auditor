import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';
const totalAccountsEl = document.getElementById('total-accounts');
const totalScansEl = document.getElementById('total-scans');
const totalFindingsEl = document.getElementById('total-findings');
const lastScanInfoEl = document.getElementById('last-scan-info');
const accountsListEl = document.getElementById('accounts-list');
const dashboardMessageEl = document.getElementById('dashboard-message');
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

const escapeHtmlAttr = (value = '') => String(value).replace(/"/g, '&quot;');
let accounts = [];
let history = [];
const setMessage = (text = '', type = 'success') => {
  if (!dashboardMessageEl) return;
  dashboardMessageEl.textContent = text;
  dashboardMessageEl.classList.remove('success', 'error');
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

const statusClass = (label) => {
  const normalized = label.toLowerCase();
  if (normalized.includes('running')) return 'running';
  if (normalized.includes('failed')) return 'failed';
  return 'completed';
};

const relativeTime = (timestamp) => {
  if (!timestamp) return 'No scans yet';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'No scans yet';
  const diff = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'moments ago';
  if (diff < hour) return `${Math.round(diff / minute)} minutes ago`;
  if (diff < day) return `${Math.round(diff / hour)} hours ago`;
  return `${Math.round(diff / day)} days ago`;
};

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

const getFindingsCount = (entry = {}) => {
  return (
    Number(entry.issues_found ?? entry.findings_count ?? entry.findings ?? entry.total_findings ?? 0) || 0
  );
};

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

const updateStats = () => {
  totalAccountsEl && (totalAccountsEl.textContent = accounts.length);
  totalScansEl && (totalScansEl.textContent = history.length);
  const totalFindings = history.reduce((sum, entry) => sum + getFindingsCount(entry), 0);
  totalFindingsEl && (totalFindingsEl.textContent = totalFindings);
  if (history.length) {
    const latest = [...history].sort(
      (a, b) => new Date(b.end_time || b.start_time || 0) - new Date(a.end_time || a.start_time || 0)
    )[0];
    const infoLabel = statusLabel(latest.status);
    const timeText = relativeTime(latest.end_time || latest.start_time || latest.created_at || 0);
    lastScanInfoEl && (lastScanInfoEl.textContent = `${timeText} ${infoLabel}`);
  } else {
    lastScanInfoEl && (lastScanInfoEl.textContent = 'Idle');
  }
};

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

const getAccountScans = (account) =>
  history
    .filter((scan) => matchAccountScan(account, scan))
    .sort(
      (a, b) =>
        new Date(b.end_time || b.start_time || b.created_at || 0) -
        new Date(a.end_time || a.start_time || a.created_at || 0)
    )
    .slice(0, 3);
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
  const recent = getAccountScans(account);
  const lastScanTimestamp =
    recent[0]?.end_time || recent[0]?.start_time || recent[0]?.created_at || account.last_scan_at;
  const lastScanText = lastScanTimestamp ? formatDateTime(lastScanTimestamp) : 'No scans yet';
  const connectionError = account.connection_issue || 'Unable to connect to cloud account';
  const providerLabel = account.provider || 'Cloud';
  const providerBadge = providerLabel.toUpperCase();
  const accountTitle = account.account_name || 'Unnamed account';
  const recentMarkup = recent.length
    ? `<ul class="recent-scans">${recent
        .map(
          (entry) =>
            `<li>${relativeTime(entry.end_time || entry.start_time || entry.created_at || 0)} - ${statusLabel(entry.status)}</li>`
        )
        .join('')}</ul>`
    : '<p class="empty-row">No recent scans</p>';
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
    <div class="account-card__info">
      <span class="last-scan-label">Last scan: ${lastScanText}</span>
      ${regionMarkup}
    </div>
    <section class="recent-scans-section">
      <p class="section-label">Recent scans</p>
      ${recentMarkup}
    </section>
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
  accountsListEl.innerHTML = '';
  if (!accounts.length) {
    accountsListEl.innerHTML = '<p class="empty-row">No cloud accounts connected yet.</p>';
    return;
  }
  accounts.forEach((account) => {
    const card = buildAccountCard(account);
    accountsListEl.appendChild(card);
    const controller = createConnectionController(account, card);
    controller.refresh();
  });
};

const buildScanningPageUrl = ({ accountId, region, accountName, providerName }) => {
  const params = new URLSearchParams();
  params.set('cloud_account_id', accountId);
  if (region) params.set('region', region);
  if (accountName) params.set('account_name', accountName);
  if (providerName) params.set('provider', providerName);
  params.set('auto_start', '1');
  return `scanning.html?${params.toString()}`;
};

const runScan = ({ accountId, region, accountName, providerName }) => {
  if (!accountId || !region) {
    setMessage('Select an account with a valid region first.', 'error');
    return;
  }
  setMessage('Redirecting to live scan console...', 'success');
  window.location.href = buildScanningPageUrl({ accountId, region, accountName, providerName });
};

const handleAccountClick = (event) => {
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
  });
};

const loadAccounts = async () => {
  try {
    const payload = await fetchJson(`${BASE_URL}/api/accounts/cloud-accounts/`, { method: 'GET' });
    accounts = Array.isArray(payload) ? payload : [];
    updateStats();
    return accounts;
  } catch (error) {
    setMessage(error.message || 'Failed to load cloud accounts.', 'error');
    accounts = [];
    renderAccounts();
    updateStats();
    return accounts;
  }
};

const loadHistory = async () => {
  try {
    const payload = await fetchJson(`${BASE_URL}/api/scanner/scan/history/`, { method: 'GET' });
    history = Array.isArray(payload) ? payload : [];
    updateStats();
    return history;
  } catch (error) {
    setMessage(error.message || 'Failed to load scan history.', 'error');
    history = [];
    updateStats();
    renderAccounts();
    return history;
  }
};

const init = async () => {
  requireAuth();
  await Promise.all([loadAccounts(), loadHistory()]);
  renderAccounts();
  accountsListEl?.addEventListener('click', handleAccountClick);
};
init();

