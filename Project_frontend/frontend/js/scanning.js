
import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const STATUS_URL = `${BASE_URL}/api/scanner/scan/status/{scan_job_id}/`;
const METADATA_URL = `${BASE_URL}/api/scanner/scan/metadata/{scan_job_id}/`;
const STOP_PATH = `${BASE_URL}/api/scanner/stop/`;
const REPORT_BASE = `${BASE_URL}/api/reports`;

const STATUS_POLL_INTERVAL = 3000;
const REPORT_POLL_INTERVAL = 4000;

const jobLabel = document.getElementById('scan-job-label');
const statusPill = document.getElementById('scan-status-pill');
const statusDetail = document.getElementById('scan-status-detail');
const regionLabel = document.getElementById('scan-region');
const providerLabel = document.getElementById('scan-provider');
const accountLabel = document.getElementById('scan-account');
const messageEl = document.getElementById('scan-page-message');
const stopButton = document.getElementById('stop-scan');
const liveLoader = document.getElementById('live-scan-loader');

const params = new URLSearchParams(window.location.search);

const jobId = params.get('scan_job_id');
const accountId = params.get('cloud_account_id');
const regionParam = params.get('region');
const accountName = params.get('account_name');
const providerName = params.get('provider');

let pollTimer = null;
let stopInFlight = false;
let pollingActive = true;
let reportTimer = null;
let redirecting = false;

let displayedProgress = 0;
let animationFrameId = null;




const timerEl = document.getElementById("scan-timer");

let timerInterval = null;

const getStartTime = () => {
  const activeScan = JSON.parse(localStorage.getItem("activeScan") || "null");
  return activeScan?.startTime;
};

const formatTime = (ms) => {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};



const stopPolling = () => {
  pollingActive = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
};

const stopReportPolling = () => {
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
};

const buildReportUrl = () => {
  const url = new URL('report.html', window.location.href);

  url.searchParams.set('scan_job_id', jobId);

  if (accountId) url.searchParams.set('cloud_account_id', accountId);
  if (accountName) url.searchParams.set('account_name', accountName);
  if (providerName) url.searchParams.set('provider', providerName);

  return url.toString();
};

const checkReportReady = async () => {
  try {
    const res = await fetchWithAuth(`${REPORT_BASE}/${jobId}/summary/`);
    if (res.ok) return true;
    if (res.status === 404) return false;
  } catch (err) {
    // ignore transient failures and keep polling
  }
  return false;
};

const scheduleReportRedirect = () => {
  if (redirecting) return;
  redirecting = true;

  const tick = async () => {
    const ready = await checkReportReady();
    if (ready) {
      stopReportPolling();
      window.location.assign(buildReportUrl());
      return;
    }

    reportTimer = setTimeout(tick, REPORT_POLL_INTERVAL);
  };

  // run immediately once
  tick();
};

const setLiveLoaderVisibility = (visible) => {
  if (!liveLoader) return;
  liveLoader.classList.toggle('hidden', !visible);
};

const setMessage = (text = '', type = 'info') => {
  if (!messageEl) return;

  messageEl.textContent = text;
  messageEl.className = 'message';

  if (!text) return;

  messageEl.classList.add(
    type === 'success' ? 'success' :
      type === 'error' ? 'error' :
        'info'
  );
};

const STATUS_STATES = ['running', 'pending', 'queued', 'processing'];
const TERMINAL_KEYWORDS = [
  'completed',
  'complete',
  'failed',
  'error',
  'interrupted',
  'stopped',
  'finished',
  'cancelled',
  'canceled',
];

const isTerminalStatus = (value = '') => {
  const normalized = value.toString().toLowerCase();
  return TERMINAL_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const pickStatusClass = (value = '') => {

  const normalized = value.toLowerCase();

  if (/(fail|error)/.test(normalized)) return 'failed';

  if (STATUS_STATES.some(s => normalized.includes(s)))
    return 'running';

  return 'completed';
};

const updateStatus = (scan) => {

  const label = scan?.status || 'Pending';
  const cssClass = pickStatusClass(label);

  // -------------------------------
  // STATUS UI
  // -------------------------------
  statusPill.textContent = label;

  statusPill.classList.remove('running', 'completed', 'failed', 'pending');
  statusPill.classList.add(cssClass);

  setLiveLoaderVisibility(cssClass === 'running');

  // -------------------------------
  // PROGRESS DATA FROM API
  // -------------------------------
  const progress = scan.progress || 0;
  const completed = scan.completed_units || 0;
  const total = scan.total_units || 0;
  const currentService = scan.current_service;
  const currentRegion = scan.current_region;

const progressBar = document.querySelector(".scan-progress-fill");

// if (progressBar) {
//   progressBar.style.width = `${progress}%`;
//   const progressValue = document.querySelector(".scan-progress-fill_value");
//   if (progressValue) {
//     progressValue.textContent = `${animateProgress(progress)}%`;
//   }
// }

if (progressBar) {
  animateProgress(progress);
}


if (currentRegion) {
  const selectedRegion = document.querySelector("#scan-region-detail");

  selectedRegion.innerHTML = `
    <span>
      Scanning region:
    </span>
    <span class="region-pill">
      ${currentRegion}
    </span>
  `;
}
  // -------------------------------
  // DETAILS TEXT (SMART DISPLAY)
  // -------------------------------
 if (statusDetail) {

  if (cssClass === 'completed') {
    statusDetail.textContent = 'Scan finished';
  }

  else if (currentService) {

    // Smart messaging
    statusDetail.textContent = `Scanning ${currentService}..`;
  }

  else {
    statusDetail.textContent = `Preparing scan...`;
  }
}

  // -------------------------------
  // ❗ ONLY STOP WHEN TERMINAL
  // -------------------------------
  if (!isTerminalStatus(label)) return;

  // 👉 NOW stop everything (ONLY here)
  stopButton && (stopButton.disabled = true);
  stopPolling();

  // Force progress to 100%
  if (progressBar) {
    progressBar.style.width = "100%";
  }

  // -------------------------------
  // FINAL STATES
  // -------------------------------
  if (cssClass === 'failed') {
    setMessage('Scan failed. Check backend logs or try again.', 'error');
    stopReportPolling();
    return;
  }

  if (label.toLowerCase().includes('interrupt') || label.toLowerCase().includes('stop')) {
    setMessage('Scan stopped.', 'info');
    stopReportPolling();
    return;
  }

  setMessage('Scan finished. Preparing report...', 'success');
  scheduleReportRedirect();
};

const refreshStatus = async () => {

  if (!jobId) return;

  try {

    const url = STATUS_URL.replace("{scan_job_id}", jobId);

    const res = await fetchWithAuth(url);

    if (!res.ok) return;

    const scan = await res.json();

    updateStatus(scan);

  } catch (err) {

    console.warn("Status check failed", err);

  }

};

const pollCycle = async () => {

  if (!pollingActive) return;
  await refreshStatus();
  if (!pollingActive) return;
  pollTimer = setTimeout(pollCycle, STATUS_POLL_INTERVAL);

};

const stopScan = async () => {

  if (!jobId || stopInFlight) return;

  stopInFlight = true;

  stopButton && (stopButton.disabled = true);

  try {

    const response = await fetchWithAuth(STOP_PATH, {

      method: 'POST',

      body: JSON.stringify({
        scan_job_id: jobId,
        cloud_account_id: accountId
      })

    });

    const payload = await response.json().catch(() => null);

    if (!response.ok)
      throw new Error(payload?.detail || 'Stop failed');

    setMessage('Stop request sent.', 'success');

  } catch (error) {

    setMessage(error.message, 'error');

  } finally {

    stopInFlight = false;

  }

};

const renderRegions = (regions = []) => {

  if (!regionLabel) return;

  // Normalize input
  const list = Array.isArray(regions)
    ? regions
    : (regions ? [regions] : []);

  if (list.length === 0) {
    regionLabel.textContent = '-';
    return;
  }

  // Single region
  if (list.length === 1) {
    regionLabel.textContent = list[0];
    return;
  }

  // Multiple regions → pill style + overflow
  const first = list[0];
  const extraCount = list.length - 1;

  regionLabel.innerHTML = `
    <span>
      ${first}
    </span>
    <span class="region-pill">
      +${extraCount}
    </span>
  `;
};

const loadScanMetadata = async () => {

  if (!jobId) return;

  try {

    const url = METADATA_URL.replace("{scan_job_id}", jobId);

    const res = await fetchWithAuth(url);

    if (!res.ok) return;

    const scan = await res.json();

    providerLabel && (providerLabel.textContent = scan.provider || '-');
    accountLabel && (accountLabel.textContent = scan.account_name || '-');

    renderRegions(scan.regions || scan.region);

  } catch (err) {

    console.warn("Metadata fetch failed", err);

  }

};

const init = () => {

  requireAuth();

  if (!jobId) {

    setMessage(
      'Scan job identifier missing.',
      'error'
    );

    return;

  }

  jobLabel && (jobLabel.textContent = `#${jobId}`);

  loadScanMetadata();   // fetch once

  stopButton?.addEventListener('click', stopScan);

  setLiveLoaderVisibility(true);

  pollCycle();

};




function animateProgress(target) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  const duration = 500;
  const start = displayedProgress;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    const currentValue = Math.floor(start + (target - start) * progress);

    document.querySelector(".scan-progress-fill").style.width = currentValue + "%";
    document.querySelector(".scan-progress-fill_value").innerText = currentValue + "%";

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(update);
    } else {
      displayedProgress = target;
    }
  }

  animationFrameId = requestAnimationFrame(update);
}

init();
