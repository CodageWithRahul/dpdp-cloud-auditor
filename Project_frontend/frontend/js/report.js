import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const REPORT_BASE = `${BASE_URL}/api/reports`;
const CLOUD_REPORT_BASE = `${BASE_URL}/api/reports/cloud-accounts`;
const reportDetails = document.getElementById('report-details');
const scanJobInput = document.getElementById('scan-job-id');
const loadReportButton = document.getElementById('load-report-button');
const summaryGrid = document.getElementById('summary-grid');
const severityChart = document.getElementById('severity-chart');
const serviceImpactChart = document.getElementById('service-impact-chart');
const vulnerabilityBody = document.querySelector('#vulnerability-table tbody');
const actionPlanList = document.getElementById('action-plan');
const reportMessage = document.getElementById('report-message');
const reportTitle = document.getElementById('report-title');
const reportProvider = document.getElementById('report-provider');
const reportAccount = document.getElementById('report-account');
const reportScanDate = document.getElementById('report-scan-date');
const reportRegion = document.getElementById('report-region');
const reportLastUpdated = document.getElementById('report-last-updated');
const reportJobId = document.getElementById('report-job-id');
const safetyLabel = document.getElementById('report-safety');
const reportLogStream = document.getElementById('report-log-stream');
const reportRiskScore = document.getElementById('report-risk-score');
const reportRiskText = document.getElementById('report-risk-text');
const reportStateLabel = document.getElementById('report-state-label');
const reportFindingsCount = document.getElementById('report-findings-count');
const pdfButton = document.getElementById('download-report-pdf');
const excelButton = document.getElementById('download-report-excel');
const includeLogsCheckbox = document.getElementById('include-logs-checkbox');
const backButton = document.getElementById('back-to-dashboard');
const severityPieCanvas = document.getElementById('severity-pie-chart');
const severityPieLegend = document.getElementById('severity-pie-legend');
const DEFAULT_REPORT_TITLE = reportTitle?.textContent || 'Scan Summary & Insights';
const LOG_POLL_INTERVAL = 4000;
const MAX_LOG_POLL_ATTEMPTS = 6;
let logPollTimer = null;
let logPollAttempts = 0;
let currentAccountId = null;
let currentAccountName = null;
let currentProviderName = null;
let lastLoadedJobId = null;
const setAccountMetadataOverrides = ({ name, provider } = {}) => {
  if (name !== undefined) {
    currentAccountName = name || null;
  }
  if (provider !== undefined) {
    currentProviderName = provider || null;
  }
};

const regionParam = new URLSearchParams(window.location.search).get('region');

const resolveRegionCandidate = (candidate) => {
  const pool = [];
  const capture = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(capture);
      return;
    }
    const trimmed = value.toString().trim();
    if (trimmed) {
      pool.push(trimmed);
    }
  };
  capture(candidate);
  if (!pool.length && regionParam) {
    capture(regionParam);
  }
  if (!pool.length) return null;
  const allMatch = pool.find((entry) => entry.toUpperCase() === 'ALL');
  return allMatch || pool[0];
};

const formatRegionValue = (value) => {
  if (!value) return '-';
  if (value.toUpperCase() === 'ALL') return 'All regions';
  return value;
};

const setRegionDisplay = (candidate) => {
  if (!reportRegion) return;
  const resolved = resolveRegionCandidate(candidate);
  reportRegion.textContent = formatRegionValue(resolved);
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_COLORS = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#34d399',
  info: '#60a5fa',
};

const showReportDetails = () => {
  if (!reportDetails) return;
  reportDetails.removeAttribute('hidden');
};

const hideReportDetails = () => {
  if (!reportDetails) return;
  reportDetails.setAttribute('hidden', '');
};

const setMessage = (text = '', type = 'info') => {
  if (!reportMessage) return;
  reportMessage.textContent = text;
  reportMessage.className = 'message';
  if (!text) return;
  if (type === 'success') {
    reportMessage.classList.add('success');
  } else if (type === 'error') {
    reportMessage.classList.add('error');
  } else {
    reportMessage.classList.add('idle');
  }
};

const setLoading = (isLoading) => {
  if (!loadReportButton) return;
  loadReportButton.disabled = isLoading;
  loadReportButton.textContent = isLoading ? 'Loading-' : 'Load report';
};

const formatLabel = (value) =>
  value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '-';
    }
  }
  return String(value);
};

const formatTimestamp = (value) => {
  if (!value) return 'now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const normalizeLogPayload = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.logs)) return payload.logs;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
};

const normalizeScanLogPayload = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.scan_logs)) return payload.scan_logs;
  return normalizeLogPayload(payload);
};

const renderReportLogs = (entries = []) => {
  if (!reportLogStream) return;
  reportLogStream.innerHTML = '';
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No logs were recorded for this scan.';
    reportLogStream.appendChild(empty);
    return;
  }
  entries.forEach((entry, index) => {
    const message = entry.message || entry.msg || entry.detail || entry.text || entry.log || entry.status || JSON.stringify(entry);
    const timestamp = entry.timestamp || entry.time || entry.created_at || '';
    const row = document.createElement('div');
    row.className = 'report-log-entry';
    const count = document.createElement('span');
    count.className = 'report-log-count';
    count.textContent = `${index + 1}.`;
    const time = document.createElement('span');
    time.className = 'report-log-time';
    time.textContent = timestamp ? formatTimestamp(timestamp) : 'Unknown time';
    const content = document.createElement('p');
    content.textContent = message || '-';
    row.appendChild(count);
    row.appendChild(time);
    row.appendChild(content);
    reportLogStream.appendChild(row);
  });
  reportLogStream.scrollTop = reportLogStream.scrollHeight;
};

const clearReportLogs = () => {
  if (!reportLogStream) return;
  reportLogStream.innerHTML = '<p class="muted">Logs will appear here when a scan job is loaded.</p>';
};

const fetchScanLogs = async (jobId) => {
  if (!jobId) return [];
  const candidates = [
    `${REPORT_BASE}/${jobId}/logs/`,
    `${BASE_URL}/api/scanner/logs/?scan_job_id=${encodeURIComponent(jobId)}`,
    `${BASE_URL}/api/scanner/scan/logs/?scan_job_id=${encodeURIComponent(jobId)}`,
  ];
  for (const url of candidates) {
    try {
      const response = await fetchWithAuth(url, { method: 'GET' });
      if (!response.ok) {
        if (response.status === 404) continue;
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || payload?.message || 'Unable to load scan logs.');
      }
      const payload = await response.json().catch(() => null);
      return normalizeLogPayload(payload);
    } catch (error) {
      if (error.message && /not found/i.test(error.message)) {
        continue;
      }
    }
  }
  throw new Error('Scan log archive is not available for this job.');
};

const loadReportLogs = async (jobId, { silent = false } = {}) => {
  if (!reportLogStream || !jobId) return [];
  if (!silent) {
    reportLogStream.innerHTML = '<p class="muted">Loading scan logs...</p>';
  }
  try {
    const logs = await fetchScanLogs(jobId);
    renderReportLogs(logs);
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    if (!silent) {
      reportLogStream.innerHTML = `<p class="muted">${error?.message || 'Unable to load scan logs.'}</p>`;
    }
    return [];
  }
};

const stopLogPolling = () => {
  if (logPollTimer) {
    clearTimeout(logPollTimer);
    logPollTimer = null;
  }
  logPollAttempts = 0;
};

const ensureReportLogs = async (jobId, { silent = false } = {}) => {
  if (!jobId) return;
  logPollAttempts += 1;
  const logs = await loadReportLogs(jobId, { silent });
  const hasLogs = Array.isArray(logs) && logs.length > 0;
  if (!hasLogs && logPollAttempts < MAX_LOG_POLL_ATTEMPTS) {
    scheduleLogRetry(jobId);
  }
};

const scheduleLogRetry = (jobId) => {
  if (logPollTimer) {
    clearTimeout(logPollTimer);
  }
  logPollTimer = window.setTimeout(() => ensureReportLogs(jobId, { silent: true }), LOG_POLL_INTERVAL);
};

const startLogPolling = (jobId) => {
  stopLogPolling();
  if (!jobId) return;
  ensureReportLogs(jobId);
};

const computeRiskScore = (findings = []) => {
  const counts = buildSeverityCounts(findings);
  const weight = counts.critical * 18 + counts.high * 10 + counts.medium * 5 + counts.low * 2;
  const score = Math.max(10, Math.min(100, 100 - weight));
  return score;
};

const getRiskText = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Moderate';
  return 'Needs attention';
};

const renderReportOverview = (findings = []) => {
  const score = computeRiskScore(findings);
  if (reportRiskScore) reportRiskScore.textContent = `${score}%`;
  if (reportRiskText) reportRiskText.textContent = getRiskText(score);
  if (reportStateLabel) reportStateLabel.textContent = findings.length ? 'Findings available' : 'No findings detected';
  if (reportFindingsCount) reportFindingsCount.textContent = String(findings.length);
};

const buildCloudResultsUrl = (accountId, scanJobId) => {
  const base = `${CLOUD_REPORT_BASE}/${accountId}/results/`;
  if (!scanJobId) return base;
  return `${base}?scan_job_id=${encodeURIComponent(scanJobId)}`;
};

const aggregateSummaryFromFindings = (items = []) => {
  const counts = buildSeverityCounts(items);
  return {
    total_findings: items.length,
    critical_issues: counts.critical,
    high_issues: counts.high,
    medium_issues: counts.medium,
    low_issues: counts.low,
    findings_count: items.length,
  };
};

const aggregateServicesFromFindings = (items = []) => {
  const accumulator = {};
  items.forEach((item) => {
    const label = item.service || item.service_name || item.scanner || 'Service';
    const key = label.toLowerCase();
    const advice = item.advice || item.recommendation || item.details || item.action || '';
    if (!accumulator[key]) {
      accumulator[key] = { service: label, issue_count: 0, advice };
    }
    accumulator[key].issue_count += 1;
    if (!accumulator[key].advice && advice) {
      accumulator[key].advice = advice;
    }
  });
  return Object.values(accumulator);
};

const renderSummary = (summary) => {
  if (!summaryGrid) return;
  summaryGrid.innerHTML = '';
  if (!summary || typeof summary !== 'object') {
    summaryGrid.innerHTML = '';
    return;
  }
  const mapping = {
    total_findings: 'Total findings',
    critical_issues: 'Critical issues',
    high_issues: 'High issues',
    medium_issues: 'Medium issues',
    low_issues: 'Low issues',
    duration_seconds: 'Scan duration',
    findings_count: 'Findings count',
  };
  const entries = Object.entries(mapping)
    .map(([key, label]) => ({ key, label, value: summary[key] }))
    .filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== '')
    .slice(0, 4);
  if (!entries.length) {
    summaryGrid.innerHTML = '';
    return;
  }
  entries.forEach(({ label, value }) => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <h4>${label}</h4>
      <strong>${formatValue(value)}</strong>
    `;
    summaryGrid.appendChild(card);
  });
};

const buildSeverityCounts = (items = []) => {
  const counts = SEVERITY_ORDER.reduce((memo, severity) => ({ ...memo, [severity]: 0 }), {});
  items.forEach((item) => {
    const severity = (item.severity || item.priority || 'info').toString().toLowerCase();
    const bucket = SEVERITY_ORDER.find((level) => severity.includes(level)) || 'info';
    counts[bucket] += 1;
  });
  return counts;
};

const renderSeverityChart = (items = []) => {
  if (!severityChart) return;
  severityChart.innerHTML = '';
  const counts = buildSeverityCounts(items);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  SEVERITY_ORDER.forEach((severity) => {
    const bar = document.createElement('div');
    bar.className = 'severity-bar';
    const label = document.createElement('span');
    label.className = 'severity-bar-label';
    label.textContent = severity;
    const track = document.createElement('div');
    track.className = 'severity-bar-track';
    const fill = document.createElement('div');
    fill.className = 'severity-bar-fill';
    fill.style.width = `${Math.round((counts[severity] / total) * 100)}%`;
    fill.style.background = SEVERITY_COLORS[severity];
    track.appendChild(fill);
    const value = document.createElement('span');
    value.textContent = counts[severity];
    bar.appendChild(label);
    bar.appendChild(track);
    bar.appendChild(value);
    severityChart.appendChild(bar);
  });
};

const renderSeverityPie = (items = []) => {
  if (!severityPieCanvas) return;
  const ctx = severityPieCanvas.getContext('2d');
  if (!ctx) return;
  const counts = buildSeverityCounts(items);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const width = severityPieCanvas.width;
  const height = severityPieCanvas.height;
  ctx.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.4;
  let startAngle = -0.5 * Math.PI;
  const segments = [];
  if (total > 0) {
    SEVERITY_ORDER.forEach((severity) => {
      const value = counts[severity];
      if (!value) return;
      const slice = (value / total) * Math.PI * 2;
      ctx.fillStyle = SEVERITY_COLORS[severity];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + slice);
      ctx.closePath();
      ctx.fill();
      segments.push({ severity, value });
      startAngle += slice;
    });
  } else {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  if (severityPieLegend) {
    if (segments.length) {
      severityPieLegend.innerHTML = segments
        .map(
          (segment) =>
            `<div class="plot-legend-row"><span class="plot-swatch" style="background:${SEVERITY_COLORS[segment.severity]}"></span>${segment.severity}: ${segment.value}</div>`
        )
        .join('');
    } else {
      severityPieLegend.innerHTML = '<p class="muted">No findings yet.</p>';
    }
  }
};


const renderServiceChart = (services = []) => {
  if (!serviceImpactChart) return;
  serviceImpactChart.innerHTML = '';
  if (!services.length) {
    serviceImpactChart.innerHTML = '<p class="muted">Service impact will appear here.</p>';
    return;
  }
  const values = services.map((service) => {
    const count = Number(service.issue_count ?? service.issues ?? service.findings ?? 0);
    return {
      label: service.service || service.service_name || 'Service',
      value: Math.max(count, 0),
    };
  });
  const maxValue = Math.max(...values.map((item) => item.value), 1);
  values.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'service-bar';
    const label = document.createElement('span');
    label.className = 'service-bar-label';
    label.textContent = item.label;
    const track = document.createElement('div');
    track.className = 'service-bar-track';
    const fill = document.createElement('div');
    fill.className = 'service-bar-fill';
    fill.style.width = `${Math.round((item.value / maxValue) * 100)}%`;
    track.appendChild(fill);
    const valueEl = document.createElement('span');
    valueEl.textContent = item.value;
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(valueEl);
    serviceImpactChart.appendChild(row);
  });
};

const renderResults = (items = []) => {
  if (!vulnerabilityBody) return;
  vulnerabilityBody.innerHTML = '';
  if (!items.length) {
    vulnerabilityBody.innerHTML = '<tr><td colspan="6" class="empty-row">No vulnerabilities to display.</td></tr>';
    updateSafetyLabel(true);
    return;
  }
  updateSafetyLabel(false);
  items.forEach((item) => {
    const row = document.createElement('tr');
    row.className = 'vulnerability-row';
    const severity = (item.severity || item.priority || 'info').toString().toLowerCase();
    const severityLabel = SEVERITY_ORDER.find((level) => severity.includes(level)) || 'info';
    row.innerHTML = `
      <td>${formatValue(item.resource_id || item.resource || item.resource_name)}</td>
      <td>${formatValue(item.issue_type || item.title || item.description)}</td>
      <td><span class="severity-pill ${severityLabel}">${severityLabel}</span></td>
      <td>${formatValue(item.region || item.location || item.aws_region || 'N/A')}</td>
      <td>${formatValue(item.recommendation || item.remediation || item.details)}</td>
      <td>${formatValue(item.service || item.service_name || item.scanner || 'Service')}</td>
    `;
    vulnerabilityBody.appendChild(row);
  });
};

const renderServices = (items = []) => {
  if (!actionPlanList) return;
  actionPlanList.innerHTML = '';
  if (!items.length) {
    actionPlanList.innerHTML = '<li class="empty-row">Action steps will appear once the report loads.</li>';
    return;
  }
  const prioritized = items.slice(0, 4);
  prioritized.forEach((service, index) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <strong>Step ${index + 1}: ${formatValue(service.service || service.service_name || 'Service')}</strong>
      <p class="muted">${formatValue(service.advice || service.recommendation || service.action)}</p>
    `;
    actionPlanList.appendChild(item);
  });
};

const updateSafetyLabel = (safe) => {
  if (!safetyLabel) return;
  safetyLabel.textContent = safe
    ? 'Great news — this scan did not identify any reported vulnerabilities.'
    : '';
  safetyLabel.className = safe ? 'safety-label safe' : 'safety-label';
};

const clearReport = () => {
  stopLogPolling();
  renderSummary(null);
  renderSeverityChart([]);
  renderSeverityPie([]);
  renderServiceChart([]);
  renderResults([]);
  renderServices([]);
  clearReportLogs();
  resetMetadata();
  hideReportDetails();
};

const fetchJson = async (url) => {
    const response = await fetchWithAuth(url, { method: 'GET' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.detail || payload?.message || 'Unable to load report data.';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    if (payload === null) {
      const error = new Error('Unable to load report data.');
      error.status = response.status;
      throw error;
    }
    return payload;
  };

const updateReportMetadata = ({ jobId = null, downloadAvailable = false, timestamp = null } = {}) => {
  if (reportJobId) {
    if (jobId) {
      reportJobId.textContent = jobId;
    } else if (currentAccountId) {
      reportJobId.textContent = `Account #${currentAccountId}`;
    } else {
      reportJobId.textContent = '-';
    }
  }
  if (reportLastUpdated) {
    reportLastUpdated.textContent = timestamp || (jobId ? new Date().toLocaleString() : '-');
  }
  const enableDownload = downloadAvailable;
  [pdfButton, excelButton].forEach((button) => {
    if (!button) return;
    button.disabled = !enableDownload;
  });
};

const setMetadataFromSummary = (summary) => {
  console.log(summary)
  if (!summary) return;
  if (reportProvider) {
    reportProvider.textContent = summary.cloud_account_provider || summary.provider || '-';
  }
  if (reportAccount) {
    reportAccount.textContent = summary.cloud_account_name || summary.account_name || '-';
  }
  if (reportScanDate) {
    const date = summary.scan_date || summary.scan_started_at || summary.created_at;
    reportScanDate.textContent = date ? new Date(date).toLocaleDateString() : '-';
  }
  if (reportTitle) {
    reportTitle.textContent = 'Report';
  }
  const regionSource =
    summary.scan_regions;
  setRegionDisplay(regionSource);
};
const resetMetadata = () => {
  if (reportProvider) reportProvider.textContent = currentProviderName || '-';
  if (reportAccount) reportAccount.textContent = currentAccountName || '-';
  if (reportScanDate) reportScanDate.textContent = '-';
  if (reportTitle) reportTitle.textContent = DEFAULT_REPORT_TITLE;
  setRegionDisplay();
  updateReportMetadata({ jobId: null, timestamp: null, downloadAvailable: false });
};

const setMetadataFromEntries = (entries = [], { jobId, titleSuffix } = {}) => {
  const sample = entries.find(Boolean);
  const providerName = currentProviderName || sample?.cloud_account_provider || sample?.provider || sample?.provider_name || '-';
  const accountName = currentAccountName || sample?.cloud_account_name || sample?.account_name || sample?.cloud_account || '-';
  const scanDateValue = sample?.scan_date || sample?.scan_started_at || sample?.created_at;
  if (reportProvider) reportProvider.textContent = providerName || '-';
  if (reportAccount) reportAccount.textContent = accountName || '-';
  if (reportScanDate) {
    reportScanDate.textContent = scanDateValue ? new Date(scanDateValue).toLocaleDateString() : '-';
  }
  if (reportTitle) {
    reportTitle.textContent =
      accountName && accountName !== '-'
        ? `${accountName}${titleSuffix ? ` ${titleSuffix}` : ' findings'}`
        : DEFAULT_REPORT_TITLE;
  }
  const entryRegions = entries
    .map((entry) => entry?.region || entry?.scan_region || entry?.cloud_region || entry?.cloud_account_region)
    .filter(Boolean);
  setRegionDisplay(entryRegions.length ? entryRegions : undefined);
  const hasEntries = entries.length > 0;
  const displayJobId = jobId || (hasEntries ? 'Multiple scans' : null);
  updateReportMetadata({
    jobId: displayJobId,
    downloadAvailable: hasEntries && Boolean(jobId || currentAccountId),
    timestamp: hasEntries ? new Date().toLocaleString() : null,
  });
};



const buildExportParams = () => {
  const params = new URLSearchParams();
  if (lastLoadedJobId) {
    params.set('scan_job_id', lastLoadedJobId);
  } else if (currentAccountId) {
    params.set('cloud_account_id', currentAccountId);
  } else {
    return null;
  }
  // Include logs parameter based on checkbox state
  const includeLogs = includeLogsCheckbox?.checked ?? false;
  params.set('include_logs', includeLogs.toString());
  return params;
};

const downloadReport = async (format) => {
  const params = buildExportParams();
  if (!params) {
    setMessage('Load a scan report before exporting.', 'error');
    return;
  }
  try {
    setMessage('');
    const response = await fetchWithAuth(`${REPORT_BASE}/export/${format}/?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      throw new Error('Unable to fetch report export.');
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    const identifier = lastLoadedJobId ? `scan-${lastLoadedJobId}` : `account-${currentAccountId}`;
    link.download = `cloud-audit-${identifier}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    setMessage(error?.message || 'Export failed. Try again.', 'error');
  }
};

const loadReport = async (jobId) => {
    if (!jobId) return;
    currentAccountId = null;
    lastLoadedJobId = jobId;
    setAccountMetadataOverrides({ name: null, provider: null });
    clearReport();
    setMessage('');
    setLoading(true);
    try {
      const [summaryResult, servicesResult, findingsResult] = await Promise.allSettled([
        fetchJson(`${REPORT_BASE}/${jobId}/summary/`),
        fetchJson(`${REPORT_BASE}/${jobId}/services/`),
        fetchJson(`${REPORT_BASE}/${jobId}/results/`),
      ]);
      if (summaryResult.status !== 'fulfilled') {
        throw summaryResult.reason;
      }
      const services = servicesResult.status === 'fulfilled' ? servicesResult.value : [];
      const findings = findingsResult.status === 'fulfilled' ? findingsResult.value : [];
      const summaryLogs = normalizeScanLogPayload(summaryResult.value);
      renderSummary(summaryResult.value);
      setMetadataFromSummary(summaryResult.value);
      renderSeverityChart(findings);
      renderSeverityPie(findings);
      renderServiceChart(services);
      renderResults(findings);
      renderServices(services);
      renderReportOverview(findings);
      renderReportLogs(summaryLogs);
      startLogPolling(jobId);
      setMessage(`Loaded report for scan job #${jobId}.`, 'success');
      updateReportMetadata({ jobId, downloadAvailable: true, timestamp: new Date().toLocaleString() });
      showReportDetails();
    } catch (error) {
      const unsupported = error?.status === 404 || /not found/i.test(error?.message || '');
      const message = unsupported
        ? 'No scan was found with that scan job ID.'
        : error?.message || 'Unable to load report.';
      setMessage(message, 'error');
      hideReportDetails();
    } finally {
      setLoading(false);
    }
  };

const loadAccountReport = async (accountId, { scanJobId, accountName, providerName } = {}) => {
  if (!accountId) return;
  currentAccountId = accountId;
  lastLoadedJobId = scanJobId || null;
  setAccountMetadataOverrides({ name: accountName, provider: providerName });
  clearReport();
  setMessage('');
  setLoading(true);
  try {
    const url = buildCloudResultsUrl(accountId, scanJobId);
    const entries = await fetchJson(url);
    if (!Array.isArray(entries)) {
      throw new Error('Expected report results to be a list.');
    }
    const summary = aggregateSummaryFromFindings(entries);
    renderSummary(summary);
    const serviceData = aggregateServicesFromFindings(entries);
    renderSeverityChart(entries);
    renderSeverityPie(entries);
    renderServiceChart(serviceData);
    renderResults(entries);
    renderServices(serviceData);
    renderReportOverview(entries);
    setMetadataFromEntries(entries, { jobId: scanJobId });
    if (scanJobId) {
      startLogPolling(scanJobId);
    } else {
      clearReportLogs();
    }
    if (entries.length) {
      setMessage(
        scanJobId
          ? `Showing findings for scan job #${scanJobId}.`
          : `Showing ${entries.length} findings for this account.`,
        'success'
      );
    } else {
      setMessage('No findings have been reported for this account yet.', 'info');
    }
    if (scanJobId) {
      saveJobId(scanJobId);
    }
    showReportDetails();
  } catch (error) {
    setMessage(error?.message || 'Unable to load account results.', 'error');
    hideReportDetails();
  } finally {
    setLoading(false);
  }
};


const normalizeJobId = (value) => {
  if (!value) return null;
  const normalized = `${value}`.trim();
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  return String(Math.floor(number));
};

const handleLoad = async () => {
  const jobId = normalizeJobId(scanJobInput?.value);
  if (!jobId) {
    setMessage('Provide a valid scan job ID.', 'error');
    return;
  }
  if (currentAccountId) {
    await loadAccountReport(currentAccountId, { scanJobId: jobId });
    return;
  }
  await loadReport(jobId);
  saveJobId(jobId);
};

const storedJobId = () => {
  try {
    return localStorage.getItem('last_report_scan_job');
  } catch {
    return null;
  }
};

const saveJobId = (jobId) => {
  try {
    localStorage.setItem('last_report_scan_job', jobId);
  } catch {
    // ignore storage issues
  }
};

const init = async () => {
  hideReportDetails();
  setMessage('Enter a scan ID to view the report.', 'info');
  requireAuth();
  loadReportButton?.addEventListener('click', handleLoad);
  scanJobInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLoad();
    }
  });
  pdfButton?.addEventListener('click', () => downloadReport('pdf'));
  excelButton?.addEventListener('click', () => downloadReport('excel'));
  backButton?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  const params = new URLSearchParams(window.location.search);
  const queryId = normalizeJobId(params.get('scan_job_id'));
  const accountIdParam = params.get('cloud_account_id');
  const accountNameParam = params.get('account_name');
  const providerParam = params.get('provider');
  const persisted = normalizeJobId(storedJobId());
  if (accountIdParam) {
    currentAccountId = accountIdParam;
    if (scanJobInput && queryId) {
      scanJobInput.value = queryId;
    }
    await loadAccountReport(accountIdParam, {
      scanJobId: queryId,
      accountName: accountNameParam,
      providerName: providerParam,
    });
    return;
  }
  if (queryId) {
    scanJobInput && (scanJobInput.value = queryId);
    await loadReport(queryId);
    return;
  }
  if (persisted) {
    scanJobInput && (scanJobInput.value = persisted);
  }

  // Always keep the search input empty on initial page load so only the placeholder is visible.
  if (scanJobInput) {
    scanJobInput.value = '';
  }
};


init();
