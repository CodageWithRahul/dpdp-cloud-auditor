import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';
const scanForm = document.getElementById('scan-form');
const scanButton = document.getElementById('scan-button');
const scanMessage = document.getElementById('scan-message');
const accountSelect = document.getElementById('cloud-account-select');
const regionSelect = document.getElementById('cloud-region-select');
const setMessage = (element, text, type = 'error') => {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('message--error', 'message--success');
  if (type === 'success') {
    element.classList.add('message--success');
  } else {
    element.classList.add('message--error');
  }
};

const populateAccounts = (accounts) => {
  if (!accountSelect) return;
  accountSelect.innerHTML = '';
  if (!accounts.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No cloud accounts configured';
    accountSelect.appendChild(option);
    accountSelect.disabled = true;
    scanButton.disabled = true;
    return;
  }
  accounts.forEach((account) => {
    const option = document.createElement('option');
    option.value = account.id;
    option.textContent = `${account.account_name || 'Unnamed'} (${account.region || 'n/a'})`;
    accountSelect.appendChild(option);
  });
  accountSelect.disabled = false;
  scanButton.disabled = false;
};

const loadAccounts = async () => {
  if (!accountSelect) return;
  populateAccounts([]);
  setMessage(scanMessage, 'Loading cloud accounts...', 'success');
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/`, {
      method: 'GET',
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'Unable to load cloud accounts.');
    }
    populateAccounts(payload);
    setMessage(scanMessage, '', 'success');
    if (payload.length > 0) {
      const firstAccountId = payload[0].id;
      loadRegions(firstAccountId);
    }
  } catch (error) {
    populateAccounts([]);
    setMessage(scanMessage, error?.message || 'Failed to fetch accounts.');
  }
};

const buildScanningUrl = ({ accountId, region, accountName, providerName }) => {
  const params = new URLSearchParams();
  params.set('cloud_account_id', accountId);
  if (region) params.set('region', region);
  if (accountName) params.set('account_name', accountName);
  if (providerName) params.set('provider', providerName);
  params.set('auto_start', '1');
  return `scanning.html?${params.toString()}`;
};

const redirectToScanning = (options) => {
  window.location.href = buildScanningUrl(options);
};

const startScan = (event) => {
  event.preventDefault();
  if (!accountSelect?.value) {
    setMessage(scanMessage, 'Select a cloud account before scanning.');
    return;
  }
  if (!regionSelect?.value) {
    setMessage(scanMessage, 'Select a region.');
    return;
  }
  const accountName = accountSelect.selectedOptions?.[0]?.textContent?.trim();
  setMessage(scanMessage, 'Redirecting to live scan console...', 'success');
  redirectToScanning({
    accountId: accountSelect.value,
    region: regionSelect.value,
    accountName,
  });
};

const populateRegions = (regions) => {
  if (!regionSelect) return;
  const normalized = Array.isArray(regions) ? [...new Set(regions.filter(Boolean))] : [];
  const currentValue = regionSelect.value;
  regionSelect.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = 'ALL';
  allOption.textContent = 'All Regions';
  regionSelect.appendChild(allOption);
  normalized.forEach((region) => {
    const option = document.createElement('option');
    option.value = region;
    option.textContent = region;
    regionSelect.appendChild(option);
  });
  regionSelect.disabled = false;
  if (currentValue && (currentValue === 'ALL' || normalized.includes(currentValue))) {
    regionSelect.value = currentValue;
  } else {
    regionSelect.value = 'ALL';
  }
};

const loadRegions = async (accountId) => {
  if (!accountId) return;
  populateRegions([]);
  setMessage(scanMessage, 'Loading regions...', 'success');
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/${accountId}/regions/`, { method: 'GET' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'Failed to load regions');
    }
    populateRegions(payload);
    setMessage(scanMessage, '', 'success');
  } catch (error) {
    populateRegions([]);
    setMessage(scanMessage, error?.message || 'Error loading regions');
  }
};
if (accountSelect) {
  accountSelect.addEventListener('change', (event) => {
    const accountId = event.target.value;
    loadRegions(accountId);
  });
}
export const createQuickScanPanel = ({
  logElement,
  statusElement,
  progressElement,
} = {}) => {
  let progressTimer = null;
  let progressValue = 0;
  const appendLog = (message, level = 'info') => {
    if (!logElement) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${level}`;
    entry.innerHTML = `<span>[${new Date().toLocaleTimeString()}]</span><span>${message}</span>`;
    logElement.prepend(entry);
  };
  const clearLog = () => {
    if (!logElement) return;
    logElement.innerHTML = '';
  };
  const setStatus = (text, variant = 'info') => {
    if (!statusElement) return;
    statusElement.textContent = text;
    statusElement.dataset.state = variant;
  };
  const setProgress = (value) => {
    if (!progressElement) return;
    const normalized = Math.max(0, Math.min(100, value));
    progressValue = normalized;
    progressElement.style.width = `${normalized}%`;
  };
  const stopProgress = (complete = false) => {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    if (complete) {
      setProgress(100);
    }
  };
  const startProgress = () => {
    stopProgress();
    const animate = () => {
      progressValue = Math.min(95, progressValue + Math.random() * 12 + 5);
      setProgress(progressValue);
    };
    setProgress(5);
    progressTimer = setInterval(animate, 900);
  };
  return {
    appendLog,
    clearLog,
    setStatus,
    setProgress,
    startProgress,
    stopProgress,
  };
};
if (scanForm) {
  requireAuth();
  loadAccounts();
  scanForm.addEventListener('submit', startScan);
}

