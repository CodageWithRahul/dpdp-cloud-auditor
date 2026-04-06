import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const REPORT_BASE = `${BASE_URL}/api/reports`;
const HISTORY_URL = `${BASE_URL}/api/scanner/scan/history/`;
const STATUS_POLL_INTERVAL = 3000;

const jobLabel = document.getElementById('scan-job-label');
const statusPill = document.getElementById('scan-status-pill');
const statusDetail = document.getElementById('scan-status-detail');
const regionLabel = document.getElementById('scan-region');
const providerLabel = document.getElementById('scan-provider');
const accountLabel = document.getElementById('scan-account');
const messageEl = document.getElementById('scan-page-message');
const stopButton = document.getElementById('stop-scan');
const liveLoader = document.getElementById('live-scan-loader');
const STOP_PATH = `${BASE_URL}/api/scanner/stop/`;

const params = new URLSearchParams(window.location.search);
let jobId = params.get('scan_job_id');
const accountId = params.get('cloud_account_id');
const regionParam = params.get('region');
const accountName = params.get('account_name');
const providerName = params.get('provider');
const autoStartParam = params.get('auto_start');
const autoStartEnabled =
  typeof autoStartParam === 'string' &&
  !['0', 'false', 'no'].includes(autoStartParam.toLowerCase());
const shouldAutoStart = !jobId && accountId && regionParam && autoStartEnabled;
const setLiveLoaderVisibility = (visible) => {
  if (!liveLoader) return;
  liveLoader.classList.toggle('hidden', !visible);
  liveLoader.setAttribute('aria-hidden', String(!visible));
};

let pollTimer = null;
let scanComplete = false;
let reportChecked = false;
let logKeys = new Set();
let stopInFlight = false;
let reportCheckAttempts = 0;
let statusErrorCount = 0;

const setMessage = (text = '', type = 'info') => {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = 'message';
  if (!text) return;
  messageEl.classList.add(type === 'success' ? 'success' : type === 'error' ? 'error' : 'info');
};

const formatApiError = (payload) => {
  if (!payload) return null;
  if (payload.detail) return payload.detail;
  if (payload.error) return payload.error;
  if (typeof payload === 'string') return payload;
  const serialized = Object.values(payload).reduce((acc, value) => acc.concat(Array.isArray(value) ? value : value ? [value] : []), []);
  const details = serialized.filter(Boolean).join('; ');
  return details || null;
};

const escapeHtml = (value = '') =>
  value
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTimestamp = (value) => {
  if (!value) return 'now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString();
};

const updateJobQuery = (identifier) => {
  if (!identifier) return;
  jobId = identifier.toString();
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('scan_job_id', jobId);
  window.history.replaceState({}, '', nextUrl);
};

const startScanJob = async () => {
  if (!accountId || !regionParam) return null;
  setMessage('Starting scan job...', 'info');
  setLiveLoaderVisibility(true);
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/scanner/start/`, {
      method: 'POST',
      body: JSON.stringify({
        cloud_account_id: accountId,
        region: regionParam,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatApiError(payload) || 'Failed to start the scan.');
    }
    const newJobId =
      payload?.scan_job_id ||
      payload?.scan_id ||
      payload?.job_id ||
      payload?.id;
    if (!newJobId) {
      throw new Error('Scan start response missing job identifier.');
    }
    updateJobQuery(newJobId);
    setMessage('Scan queued. Monitoring status now...', 'success');
    return jobId;
  } catch (error) {
    setLiveLoaderVisibility(false);
    if (stopButton) stopButton.disabled = true;
    setMessage(error?.message || 'Unable to start scan.', 'error');
    return null;
  }
};



const matchesJob = (scan) => {
  if (!scan || !jobId) return false;
  const candidate = (scan.scan_job_id || scan.scan_id || scan.job_id || scan.id || '').toString();
  return candidate && candidate === jobId;
};

const STATUS_STATES = ['running', 'pending', 'queued', 'processing'];
const TERMINAL_KEYWORDS = ['complete', 'completed', 'success', 'failed', 'stop', 'stopped', 'error', 'interrupted', 'finished', 'cancelled', 'canceled'];

const isTerminalStatus = (value = '') => {
  const normalized = value.toString().toLowerCase();
  return TERMINAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const pickStatusClass = (value = '') => {
  const normalized = value.toString().toLowerCase();
  if (/(err|fail)/.test(normalized)) return 'failed';
  if (STATUS_STATES.some((state) => normalized.includes(state))) return 'running';
  return 'completed';
};

const updateStatusFromEntry = (entry) => {
  if (!statusPill) return;
  const label = entry?.status || entry?.state || entry?.result || 'Pending';
  const detail = entry?.status_message || entry?.message || entry?.notes || '';
  statusPill.textContent = label;
  const cssClass = pickStatusClass(label);
  statusPill.classList.remove('running', 'completed', 'failed', 'pending');
  statusPill.classList.add(cssClass);
  if (statusDetail) {
    statusDetail.textContent = detail || (cssClass === 'completed' ? 'Scan finished' : 'Processing');
  }
  const regionValue = entry?.region || entry?.cloud_region;
  if (regionValue && regionLabel) {
    regionLabel.textContent = regionValue === 'ALL' ? 'All regions' : regionValue;
  }
  if (entry?.provider && providerLabel) {
    providerLabel.textContent = entry.provider;
  }
  if ((entry?.account_name || entry?.cloud_account_name) && accountLabel) {
    accountLabel.textContent = entry.account_name || entry.cloud_account_name;
  }
  if (!scanComplete && isTerminalStatus(label)) {
    scanComplete = true;
    setLiveLoaderVisibility(false);
    if (stopButton) {
      stopButton.disabled = true;
    }
    setMessage('Scan has finished. Checking if the report is ready...', 'info');
    checkReportAvailability();
  }
};

const refreshStatus = async () => {
  if (!jobId) return;
  try {
    const response = await fetchWithAuth(HISTORY_URL, { method: 'GET' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload)) {
      throw new Error('Unable to fetch scan status.');
    }
    const entry = payload.find(matchesJob);
    if (entry) {
      updateStatusFromEntry(entry);
    } else if (!scanComplete && statusDetail) {
      statusDetail.textContent = 'Scan record is pending';
    }
  } catch (error) {
    console.warn('Status refresh failed', error);
    if (!scanComplete && statusErrorCount === 0) {
      setMessage('Unable to refresh scan status yet; retrying shortly.', 'error');
    }
    statusErrorCount += 1;
  }
};

const buildReportUrl = () => {
  const target = new URL('report.html', window.location.href);
  target.searchParams.set('scan_job_id', jobId);
  if (accountId) target.searchParams.set('cloud_account_id', accountId);
  if (accountName) target.searchParams.set('account_name', accountName);
  if (providerName) target.searchParams.set('provider', providerName);
  return target.toString();
};

const checkReportAvailability = async () => {
  if (!jobId || reportChecked) return;
  reportCheckAttempts += 1;
  try {
    const response = await fetchWithAuth(`${REPORT_BASE}/${jobId}/summary/`, { method: 'GET' });
    if (response.ok) {
      reportChecked = true;
      setMessage('Report ready. Redirecting you to the findings now...', 'success');
      window.location.href = buildReportUrl();
      return;
    }
    if (response.status === 404) {
      reportChecked = true;
      setMessage('Scan finished. Redirecting to the report page now...', 'info');
      window.location.href = buildReportUrl();
      return;
    }
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || payload?.message || 'Report is not ready yet.');
  } catch (error) {
    if (reportCheckAttempts > 1) {
      setMessage(error?.message || 'Waiting for the report to become available...', 'info');
    }
  }
};

const pollCycle = async () => {
  await refreshStatus();
  if (!scanComplete || !reportChecked) {
    pollTimer = window.setTimeout(pollCycle, scanComplete ? STATUS_POLL_INTERVAL * 2 : STATUS_POLL_INTERVAL);
  }
};

const stopScan = async () => {
  if (!jobId || stopInFlight || scanComplete) return;
  stopInFlight = true;
  stopButton && (stopButton.disabled = true);
  try {
    const response = await fetchWithAuth(STOP_PATH, {
      method: 'POST',
      body: JSON.stringify({ scan_job_id: jobId, cloud_account_id: accountId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || payload?.message || 'Unable to cancel the scan.');
    }
    setMessage('Stop request accepted. The scanner will halt shortly.', 'success');
  } catch (error) {
    setMessage(error?.message || 'Failed to send stop request.', 'error');
  } finally {
    stopInFlight = false;
    if (!scanComplete && stopButton) {
      stopButton.disabled = false;
    }
  }
};

const init = async () => {
  requireAuth();
  if (!jobId && shouldAutoStart) {
    await startScanJob();
  }
  if (!jobId) {
    setMessage('Scan job identifier missing. Please start a scan from the dashboard.', 'error');
    stopButton && (stopButton.disabled = true);
    setLiveLoaderVisibility(false);
    return;
  }
  jobLabel && (jobLabel.textContent = `#${jobId}`);
  if (providerName && providerLabel) {
    providerLabel.textContent = providerName;
  }
  if (accountName && accountLabel) {
    accountLabel.textContent = accountName;
  }
  if (regionParam && regionLabel) {
    regionLabel.textContent = regionParam === 'ALL' ? 'All regions' : regionParam;
  }
  stopButton?.addEventListener('click', stopScan);
  pollCycle();
  window.addEventListener('beforeunload', () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
    }
  });
};

init();
