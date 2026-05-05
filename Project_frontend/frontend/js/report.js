import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const REPORT_BASE = `${BASE_URL}/api/reports`;
const CLOUD_REPORT_BASE = `${BASE_URL}/api/reports/cloud-accounts`;
const reportDetails = document.getElementById('report-details');
const scanJobInput = document.getElementById('scan-job-id');
const loadReportButton = document.getElementById('load-report-button');
const summaryGrid = document.getElementById('summary-grid');
const serviceImpactChart = document.getElementById('service-impact-chart');
const vulnerabilityBody = document.querySelector('#vulnerability-table tbody');
const actionPlanList = document.getElementById('action-plan');
const topFixesContainer = document.getElementById('top-priority-fixes');
const topFixesEmptyState = document.getElementById('top-priority-empty');
const securityGaugeCanvas = document.getElementById('security-gauge');
const trendCanvas = document.getElementById('risk-trend-chart');
const trendInsight = document.getElementById('risk-trend-insight');
const severityBreakdown = document.getElementById('severity-breakdown');
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

  let pool = [];

  const capture = (value) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(capture);
      return;
    }

    const trimmed = value.toString().trim();
    if (trimmed) pool.push(trimmed);
  };

  capture(candidate);

  // ALWAYS fallback to URL param
  if (!pool.length && regionParam) {
    capture(regionParam);
  }

  pool = [...new Set(pool)].map((entry) => (entry.toString().trim().toLowerCase() === 'all' ? 'ALL' : entry));

  reportRegion.innerHTML = '';

  // no data case
  if (!pool.length) {
    reportRegion.textContent = '-';
    return;
  }

  // ALL case
  if (pool.includes('ALL')) {
    reportRegion.textContent = 'All regions';
    return;
  }

  const first = pool[0];
  const remaining = pool.length - 1;

  // main region text
  const text = document.createElement('span');
  text.textContent = first;

  reportRegion.appendChild(text);

  // pill only if more
  if (remaining > 0) {
    const pill = document.createElement('span');
    pill.className = 'region-pill';
    pill.textContent = `+${remaining}`;

    reportRegion.appendChild(pill);
  }
};
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_COLORS = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#facc15',
  low: '#34d399',
  info: '#60a5fa',
};

// Higher means higher risk contribution.
// Keep these weights simple + explainable for non-technical users.
const SEVERITY_WEIGHTS = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
  info: 0,
};

const normalizeSeverity = (value) => {
  const raw = (value || 'info').toString().toLowerCase();
  return SEVERITY_ORDER.find((level) => raw.includes(level)) || 'info';
};

const severityRank = (severity) => {
  const idx = SEVERITY_ORDER.indexOf(severity);
  return idx === -1 ? SEVERITY_ORDER.length : idx;
};

const pickHighestSeverity = (severities = []) => {
  const normalized = severities.map(normalizeSeverity);
  return normalized.sort((a, b) => severityRank(a) - severityRank(b))[0] || 'info';
};

const normalizeIssueKey = (value) => {
  const raw = (value || '').toString().trim();
  if (!raw) return 'unknown_issue';
  return raw.toLowerCase().replace(/\s+/g, '_');
};

const extractFixSteps = (text, { max = 3 } = {}) => {
  const raw = (text || '').toString().trim();
  if (!raw) return [];

  // Split on line breaks / bullets first.
  const lines = raw
    .split(/\r?\n|•|\u2022|-/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = lines.length ? lines : raw.split(/[.;](\s|$)/g).map((s) => s.trim()).filter(Boolean);

  // Normalize: remove numbering prefixes like "1)", "2.", etc.
  const cleaned = candidates
    .map((step) => step.replace(/^\s*(\d+[\).\s]+)+/, '').trim())
    .filter((step) => step.length >= 6);

  return cleaned.slice(0, max);
};

const inferDifficulty = (recommendationText = '') => {
  const text = (recommendationText || '').toString().toLowerCase();
  if (!text) return null;
  if (/(re-?deploy|migrate|rotate keys|rebuild|refactor)/i.test(text)) return 'Hard';
  if (/(iam|policy|security group|nacl|waf|encryption|kms|rbac)/i.test(text)) return 'Medium';
  return 'Easy';
};

// "Why this matters" is frequently missing from scan outputs.
// This maps common cloud issues to plain-language impact statements.
const inferWhyThisMatters = ({ issueType = '', title = '', service = '' } = {}) => {
  const key = `${issueType} ${title} ${service}`.toLowerCase();
  if (/(ssh|port\s*22)/i.test(key)) return 'This can allow attackers to attempt unauthorized access to your server over SSH.';
  if (/(rdp|port\s*3389)/i.test(key)) return 'This can expose remote desktop access to the internet, increasing the risk of account takeover.';
  if (/(public|world|0\.0\.0\.0\/0|open)/i.test(key) && /(security group|nacl|inbound)/i.test(key))
    return 'This creates an internet-exposed entry point that attackers can scan and exploit.';
  if (/(s3|bucket)/i.test(key) && /(public|anonymous)/i.test(key))
    return 'Public storage can leak sensitive data and lead to compliance and breach risk.';
  if (/(encryption|kms)/i.test(key) && /(disabled|not enabled|unencrypted)/i.test(key))
    return 'Unencrypted data is easier to steal and may violate security and compliance requirements.';
  if (/(logging|cloudtrail|audit)/i.test(key) && /(disabled|not enabled)/i.test(key))
    return 'Without audit logs, suspicious activity is harder to detect and investigate.';
  if (/(mfa|multi[- ]factor)/i.test(key) && /(disabled|not enabled|missing)/i.test(key))
    return 'Accounts without MFA are much easier to compromise through password attacks.';
  return 'This weakens your security posture and increases the chance of unauthorized access or data exposure.';
};

const groupFindings = (items = []) => {
  const groups = new Map();

  items.forEach((item) => {
    const issueType = item.issue_type || item.issueType || item.title || item.description || 'Unknown issue';
    const groupKey = normalizeIssueKey(issueType);
    const severity = normalizeSeverity(item.severity || item.priority);
    const resourceId = formatValue(item.resource_id || item.resource || item.resource_name || item.resource_arn || item.arn || '-');
    const region = formatValue(item.region || item.location || item.aws_region || item.cloud_region || 'N/A');
    const service = formatValue(item.service || item.service_name || item.scanner || 'Service');
    const recommendationText = item.recommendation || item.remediation || item.details || item.advice || '';

    if (!groups.has(groupKey)) {
      const title = formatValue(item.title || item.issue_type || item.check_title || item.description || issueType);
      const why = inferWhyThisMatters({ issueType, title, service });
      groups.set(groupKey, {
        key: groupKey,
        issue_type: issueType,
        title,
        severity,
        service,
        regions: new Set(),
        resources: [],
        recommendationText: recommendationText || '',
        why,
      });
    }

    const group = groups.get(groupKey);
    group.severity = pickHighestSeverity([group.severity, severity]);
    if (service && service !== '-') group.service = group.service === 'Service' ? service : group.service;
    group.regions.add(region);
    group.resources.push({
      resource: resourceId,
      region,
      raw: item,
    });
    if (!group.recommendationText && recommendationText) group.recommendationText = recommendationText;
  });

  return Array.from(groups.values()).map((group) => {
    const steps = extractFixSteps(group.recommendationText, { max: 3 });
    const fallback = steps.length
      ? steps
      : [
          'Identify the affected resource(s) and confirm exposure.',
          'Apply the recommended configuration change in the cloud console/IaC.',
          'Re-run the scan to validate the fix.',
        ];
    const difficulty = inferDifficulty(group.recommendationText);

    return {
      ...group,
      regions: Array.from(group.regions),
      affected_count: group.resources.length,
      fix_steps: fallback,
      difficulty,
      risk_points: SEVERITY_WEIGHTS[group.severity] * Math.min(10, Math.max(1, group.resources.length / 2)),
    };
  });
};

// 0 findings -> 100. More + higher-severity findings -> lower score.
// The scoring is intentionally simple & transparent, not a CVSS replacement.
const computeRiskScore = (findings = []) => {
  if (!Array.isArray(findings) || findings.length === 0) return 100;

  const counts = buildSeverityCounts(findings);
  const total =
    counts.critical * SEVERITY_WEIGHTS.critical +
    counts.high * SEVERITY_WEIGHTS.high +
    counts.medium * SEVERITY_WEIGHTS.medium +
    counts.low * SEVERITY_WEIGHTS.low;

  // Normalize against a "worst case" where every finding is critical.
  const max = findings.length * SEVERITY_WEIGHTS.critical;
  const ratio = max > 0 ? total / max : 0;
  const score = Math.round(100 - ratio * 100);
  return Math.max(0, Math.min(100, score));
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
    `${BASE_URL}/api/scanner/scan/${jobId}/logs/`,
    `${BASE_URL}/api/scanner/logs/?scan_job_id=${encodeURIComponent(jobId)}`,
    `${BASE_URL}/api/scanner/scan/?scan_job_id=${encodeURIComponent(jobId)}/logs/`,
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

const getRiskText = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 40) return 'Moderate';
  return 'Needs attention';
};

const getRiskTone = (score) => {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 40) return 'moderate';
  return 'risky';
};

const renderReportOverview = ({ findings = [], groups = [] } = {}) => {
  // Score uses raw findings (more granular than grouped issues).
  const score = computeRiskScore(findings);
  if (reportRiskScore) reportRiskScore.textContent = `${score}%`;
  if (reportRiskText) {
    const label = getRiskText(score);
    reportRiskText.textContent = `Security level: ${label}`;
    reportRiskText.classList.remove('loading', 'excellent', 'good', 'moderate', 'risky');
    reportRiskText.classList.add(getRiskTone(score));
  }

  // Counts shown to users should represent unique issues (grouped by type).
  if (reportFindingsCount) reportFindingsCount.textContent = String(groups.length);

  renderSecurityGauge(score);
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
  const innerRadius = radius * 0.62; // donut
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

      // donut hole (draw after each slice to keep edges crisp)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      segments.push({ severity, value });
      startAngle += slice;
    });
  } else {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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

const setupHiDPICanvas = (canvas, cssWidth, cssHeight) => {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dpr = window.devicePixelRatio || 1;
  const width = cssWidth || canvas.clientWidth || canvas.width;
  const height = cssHeight || canvas.clientHeight || canvas.height;

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
};

const renderSecurityGauge = (score) => {
  if (!securityGaugeCanvas) return;
  const setup = setupHiDPICanvas(securityGaugeCanvas, 320, 180);
  if (!setup) return;
  const { ctx, width, height } = setup;

  ctx.clearRect(0, 0, width, height);

  // Use padding so the stroke never clips at canvas edges.
  const centerX = width / 2;
  const centerY = height * 0.88;
  const radius = Math.min(width, height) * 0.68;
  // Draw a TOP semicircle from left (π) to right (2π).
  // This keeps y-coordinates above the center (sin is negative on π..2π).
  const start = Math.PI;
  const end = 2 * Math.PI;

  const clamp = (n) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const value = clamp(score);
  const angle = start + (value / 100) * (end - start);

  // Track
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, end);
  ctx.stroke();

  // Color zones (red <50, yellow 50-79, green 80-100)
  const zones = [
    { from: 0, to: 50, color: 'rgba(248,113,113,0.9)' },
    { from: 50, to: 80, color: 'rgba(250,204,21,0.9)' },
    { from: 80, to: 100, color: 'rgba(52,211,153,0.9)' },
  ];

  zones.forEach((zone) => {
    const a0 = start + (zone.from / 100) * (end - start);
    const a1 = start + (zone.to / 100) * (end - start);
    ctx.strokeStyle = zone.color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, a0, a1);
    ctx.stroke();
  });

  // Needle (draw with trig to avoid rotation alignment bugs)
  const needleLen = radius - 22;
  const needleX = centerX + needleLen * Math.cos(angle);
  const needleY = centerY + needleLen * Math.sin(angle);
  ctx.strokeStyle = 'rgba(226,232,240,0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(needleX, needleY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  ctx.font = '600 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${value}%`, centerX, height * 0.52);

  ctx.fillStyle = 'rgba(226,232,240,0.7)';
  ctx.font = '500 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText('Security score', centerX, height * 0.64);
};

const renderMiniGauge = (canvas, ratio, { label = '', centerText = '' } = {}) => {
  if (!canvas) return;
  const cssW = Number(canvas.getAttribute('width')) || 220;
  const cssH = Number(canvas.getAttribute('height')) || 160;
  const setup = setupHiDPICanvas(canvas, cssW, cssH);
  if (!setup) return;
  const { ctx, width, height } = setup;
  ctx.clearRect(0, 0, width, height);

  const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
  const value = clamp01(ratio);

  const centerX = width / 2;
  const centerY = height * 0.88;
  const radius = Math.min(width, height) * 0.64;
  const start = Math.PI;
  const end = 2 * Math.PI;
  const angle = start + value * (end - start);

  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, end);
  ctx.stroke();

  // Fill arc
  const zoneColor = value >= 0.8 ? 'rgba(52,211,153,0.9)' : value >= 0.5 ? 'rgba(250,204,21,0.9)' : 'rgba(248,113,113,0.9)';
  ctx.strokeStyle = zoneColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, start, angle);
  ctx.stroke();

  // Needle
  const needleLen = radius - 18;
  ctx.strokeStyle = 'rgba(226,232,240,0.95)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + needleLen * Math.cos(angle), centerY + needleLen * Math.sin(angle));
  ctx.stroke();
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Text
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(226,232,240,0.95)';
  ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.fillText(centerText || '', centerX, height * 0.55);
  if (label) {
    ctx.fillStyle = 'rgba(226,232,240,0.7)';
    ctx.font = '600 11px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(label, centerX, height * 0.68);
  }
};

const renderServiceChart = (services = []) => {
  if (!serviceImpactChart) return;
  serviceImpactChart.innerHTML = '';
  if (!services.length) {
    serviceImpactChart.innerHTML = '<p class="muted">Service impact will appear here.</p>';
    return;
  }

  const extractServiceCount = (service) => {
    const direct =
      service?.issue_count ??
      service?.issues ??
      service?.findings ??
      service?.count ??
      service?.total ??
      service?.total_findings ??
      service?.findings_count;

    const directNum = Number(direct);
    if (Number.isFinite(directNum)) return directNum;

    // Some APIs return severity buckets per service.
    const buckets = ['critical', 'high', 'medium', 'low', 'info'];
    const sum = buckets.reduce((acc, key) => {
      const n = Number(service?.[`${key}_issues`] ?? service?.[`${key}_findings`] ?? service?.[key]);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
    return sum;
  };

  const values = services.map((service) => {
    const count = extractServiceCount(service);
    return {
      label: service.service || service.service_name || 'Service',
      value: Math.max(count, 0),
    };
  }).sort((a, b) => b.value - a.value);
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

const renderKeyMetrics = ({ findings = [], summary = null } = {}) => {
  if (!summaryGrid) return;

  // Always compute from findings, then selectively override with summary values if present.
  const computed = aggregateSummaryFromFindings(findings);
  const counts = buildSeverityCounts(findings);

  const get = (key, fallback) => {
    const fromSummary = summary && typeof summary === 'object' ? summary[key] : undefined;
    const value = fromSummary ?? fallback;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : fallback;
  };

  const metrics = [
    { label: 'Critical', value: get('critical_issues', counts.critical) },
    { label: 'High', value: get('high_issues', counts.high) },
    { label: 'Medium', value: get('medium_issues', counts.medium) },
    { label: 'Low', value: get('low_issues', counts.low) },
  ];

  summaryGrid.innerHTML = '';
  metrics.forEach((metric) => {
    const card = document.createElement('div');
    card.className = 'summary-card metric-card';
    card.innerHTML = `
      <h4>${metric.label}</h4>
      <strong>${formatValue(metric.value)}</strong>
    `;
    summaryGrid.appendChild(card);
  });
};

const renderSeverityBreakdown = (findings = []) => {
  if (!severityBreakdown) return;
  severityBreakdown.innerHTML = '';

  const counts = buildSeverityCounts(findings);
  const rows = [
    { key: 'critical', label: 'Critical' },
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
    { key: 'info', label: 'Info' },
  ];

  const total = rows.reduce((sum, row) => sum + (counts[row.key] || 0), 0);
  const max = Math.max(...rows.map((r) => counts[r.key] || 0), 1);
  const pct = (value) => {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  };

  rows.forEach((row) => {
    const value = counts[row.key] || 0;
    const wrapper = document.createElement('div');
    wrapper.className = 'severity-break-row';
    wrapper.innerHTML = `
      <div class="severity-break-meta">
        <span class="severity-pill ${row.key}">${row.label}</span>
      </div>
      <div class="severity-break-bar">
        <div class="severity-break-fill ${row.key}" style="width:${Math.round((value / max) * 100)}%"></div>
      </div>
      <div class="severity-break-value">${pct(value)}% · ${value}</div>
    `;
    severityBreakdown.appendChild(wrapper);
  });
};

const renderTrendChart = (findings = []) => {
  if (!trendCanvas) return;
  const cssW = Number(trendCanvas.getAttribute('width')) || 1100;
  const cssH = Number(trendCanvas.getAttribute('height')) || 320;
  const setup = setupHiDPICanvas(trendCanvas, cssW, cssH);
  if (!setup) return;
  const { ctx, width, height } = setup;
  ctx.clearRect(0, 0, width, height);

  // Horizontal bar chart: "Top problems" ordered by severity then affected count.
  const groups = groupFindings(findings)
    .slice()
    .sort((a, b) => {
      const rank = severityRank(a.severity) - severityRank(b.severity);
      if (rank !== 0) return rank;
      return (b.affected_count || 0) - (a.affected_count || 0);
    })
    .slice(0, 10);

  if (!groups.length) {
    ctx.fillStyle = 'rgba(226,232,240,0.7)';
    ctx.font = '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('No findings to highlight yet.', 18, 32);
    if (trendInsight) trendInsight.textContent = '';
    return;
  }

  const padding = 22;
  const leftLabel = Math.min(520, Math.max(260, Math.floor(width * 0.42)));
  const chartW = width - leftLabel - padding - 18;
  const rowH = Math.max(34, Math.floor((height - padding * 2) / groups.length));
  const max = Math.max(...groups.map((g) => Number(g.affected_count || 0)), 1);

  ctx.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'middle';

  groups.forEach((group, idx) => {
    const y = padding + idx * rowH + rowH / 2;
    const label = (group.title || group.issue_type || 'Issue').toString();
    const value = Math.max(0, Number(group.affected_count || 0));
    const barW = Math.round((value / max) * chartW);

    // Label
    const clipped = label.length > 64 ? `${label.slice(0, 64)}…` : label;
    ctx.fillStyle = 'rgba(226,232,240,0.86)';
    ctx.fillText(clipped, 18, y);

    // Track
    const trackX = leftLabel;
    const trackY = y - 8;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(trackX, trackY, chartW, 16);

    // Fill (severity-colored)
    ctx.fillStyle = SEVERITY_COLORS[group.severity] || 'rgba(59,130,246,0.9)';
    ctx.fillRect(trackX, trackY, barW, 16);

    // Value
    ctx.fillStyle = 'rgba(226,232,240,0.80)';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), width - 18, y);
    ctx.textAlign = 'left';
  });

  if (trendInsight) {
    const top = groups[0];
    trendInsight.textContent = top
      ? `Top issue: ${top.title} (${top.affected_count} affected).`
      : '';
  }
};

const renderOverview = ({ summary = null, findings = [], groups = [] } = {}) => {
  // Top-level overview cards
  renderReportOverview({ findings, groups });

  // "Key metrics" grid
  renderKeyMetrics({ findings, summary });
  renderSeverityBreakdown(findings);

  // Total findings mini gauge (same row)
  const totalCanvas = document.getElementById('total-findings-gauge');
  const total = groups.length;
  const denom = Math.max(5, total * 1.4); // self-scaled (no history available)
  const ratio = denom > 0 ? 1 - Math.min(1, total / denom) : 1;
  renderMiniGauge(totalCanvas, ratio, { label: 'Findings', centerText: String(total) });
};

const renderCharts = ({ findings = [], services = [] } = {}) => {
  renderSeverityPie(findings);
  const fallback = aggregateServicesFromFindings(findings);
  const safeServices = Array.isArray(services) && services.length ? services : fallback;
  renderServiceChart(safeServices);
};

const renderTopRisks = (groups = []) => {
  renderTopPriorityFixes(groups);
};

const renderAll = ({ summary = null, findings = [], services = [] } = {}) => {
  const grouped = groupFindings(findings).sort((a, b) => {
    const rank = severityRank(a.severity) - severityRank(b.severity);
    if (rank !== 0) return rank;
    return (b.affected_count || 0) - (a.affected_count || 0);
  });

  // Overview + charts + prioritized sections
  renderOverview({ summary, findings, groups: grouped });
  renderTrendChart(findings);
  renderCharts({ findings, services });
  renderTopRisks(grouped);
  renderActionPlan(grouped);
  renderFindingsTable(grouped, { rawFindings: findings });
};

const clearVisuals = () => {
  renderKeyMetrics({ findings: [], summary: null });
  renderSeverityPie([]);
  renderServiceChart([]);
  renderTopPriorityFixes([]);
  renderActionPlan([]);
  renderFindingsTable([]);
  renderSecurityGauge(100);
  renderSeverityBreakdown([]);
  renderTrendChart([]);
};

const renderFindingsTable = (groups = [], { rawFindings = [] } = {}) => {
  if (!vulnerabilityBody) return;
  vulnerabilityBody.innerHTML = '';

  if (!rawFindings.length) {
    vulnerabilityBody.innerHTML = '<tr><td colspan="2" class="empty-row">✅ Your cloud environment is secure. No major risks detected.</td></tr>';
    updateSafetyLabel(true);
    return;
  }

  updateSafetyLabel(false);

  groups.forEach((group) => {
    const row = document.createElement('tr');
    row.className = 'vulnerability-row';
    row.innerHTML = `
      <td class="issue-cell">
        <div class="issue-title">
          <strong>${formatValue(group.title)}</strong>
          <span class="severity-pill ${group.severity}">${group.severity}</span>
        </div>
        <p class="issue-why">${formatValue(group.why)}</p>
        <div class="issue-meta">
          <span class="meta-pill">${group.affected_count} affected</span>
          <span class="meta-pill">${formatValue(group.service)}</span>
          <span class="meta-pill">${group.regions.length ? group.regions.map(formatRegionValue).join(', ') : 'N/A'}</span>
          ${group.difficulty ? `<span class="meta-pill difficulty">${group.difficulty}</span>` : ''}
        </div>
      </td>
      <td class="fix-cell">
        <div class="fix-guide">
          <p class="fix-guide-title">Fix guide</p>
          <ul class="fix-steps">
            ${group.fix_steps.map((step) => `<li>${formatValue(step)}</li>`).join('')}
          </ul>
          <details class="resource-details">
            <summary>View affected resources (${group.affected_count})</summary>
            <ul class="resource-list">
              ${group.resources
                .slice(0, 30)
                .map((resource) => `<li><span class="resource-id">${formatValue(resource.resource)}</span><span class="resource-region">${formatRegionValue(resource.region)}</span></li>`)
                .join('')}
              ${group.resources.length > 30 ? `<li class="muted">+${group.resources.length - 30} more…</li>` : ''}
            </ul>
          </details>
        </div>
      </td>
    `;
    vulnerabilityBody.appendChild(row);
  });
};

const renderResults = (items = []) => {
  // Backwards-compatible entry point for any older call sites.
  const summary = aggregateSummaryFromFindings(items);
  const services = aggregateServicesFromFindings(items);
  renderAll({ findings: items, services, summary });
};

const buildActionPlan = (groups = []) => {
  const top = (groups || [])
    .slice()
    .sort((a, b) => {
      const rank = severityRank(a.severity) - severityRank(b.severity);
      if (rank !== 0) return rank;
      return (b.affected_count || 0) - (a.affected_count || 0);
    })
    .slice(0, 6);

  return top.map((group, index) => ({
    step: index + 1,
    title: `Fix: ${group.title}`,
    severity: group.severity,
    why: group.why,
    first_fix: group.fix_steps?.[0] || null,
  }));
};

const renderActionPlan = (groups = []) => {
  if (!actionPlanList) return;
  actionPlanList.innerHTML = '';
  if (!groups.length) {
    actionPlanList.innerHTML = '<li class="empty-row">Action steps will appear once the report loads.</li>';
    return;
  }

  const plan = buildActionPlan(groups);
  plan.forEach((entry) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <div class="action-plan-head">
        <strong>Step ${entry.step}: ${formatValue(entry.title)} <span class="severity-pill ${entry.severity}">${entry.severity}</span></strong>
      </div>
      <p class="muted">${formatValue(entry.why)}</p>
      ${entry.first_fix ? `<p class="action-plan-fix"><span class="muted">Start with:</span> ${formatValue(entry.first_fix)}</p>` : ''}
    `;
    actionPlanList.appendChild(item);
  });
};

const renderTopPriorityFixes = (groups = []) => {
  if (!topFixesContainer) return;

  const top = (groups || [])
    .filter((group) => ['critical', 'high'].includes(group.severity))
    .slice()
    .sort((a, b) => {
      const rank = severityRank(a.severity) - severityRank(b.severity);
      if (rank !== 0) return rank;
      return (b.affected_count || 0) - (a.affected_count || 0);
    })
    .slice(0, 5);

  topFixesContainer.innerHTML = '';
  if (topFixesEmptyState) {
    topFixesEmptyState.hidden = top.length > 0;
    if (!top.length) {
      topFixesEmptyState.textContent = groups.length
        ? '✅ No HIGH/CRITICAL issues detected. Keep up the good work.'
        : 'Load a scan job to see prioritized fixes.';
    }
  }

  if (!top.length) return;

  top.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'fix-card';
    card.innerHTML = `
      <header class="fix-card-head">
        <div class="fix-card-title">
          <strong>${formatValue(group.title)}</strong>
          <span class="severity-pill ${group.severity}">${group.severity}</span>
        </div>
        <div class="fix-card-meta">
          <span class="meta-pill">${group.affected_count} affected</span>
          ${group.difficulty ? `<span class="meta-pill difficulty">${group.difficulty}</span>` : ''}
        </div>
      </header>
      <p class="fix-card-why">${formatValue(group.why)}</p>
      <ul class="fix-steps">
        ${group.fix_steps.slice(0, 3).map((step) => `<li>${formatValue(step)}</li>`).join('')}
      </ul>
    `;
    topFixesContainer.appendChild(card);
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
  clearVisuals();
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
  if (!summary) return;
  if (reportProvider) {
    reportProvider.textContent = summary.cloud_account_provider || summary.provider || '-';
  }
  if (reportAccount) {
    reportAccount.textContent = summary.cloud_account_name || summary.account_name || '-';
  }
  if (reportScanDate) {
    const date =
      summary.scan_date ||
      summary.scan_started_at ||
      summary.start_time ||
      summary.end_time ||
      summary.created_at;
    reportScanDate.textContent = date ? new Date(date).toLocaleDateString() : '-';
  }
  if (reportTitle) {
    reportTitle.textContent = 'Report';
  }
  const regionSource =
    summary.scan_regions ||
    summary.region ||
    regionParam;
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
    const services = servicesResult.status === 'fulfilled' && Array.isArray(servicesResult.value) ? servicesResult.value : [];
    const findings = findingsResult.status === 'fulfilled' && Array.isArray(findingsResult.value) ? findingsResult.value : [];
    const summaryLogs = normalizeScanLogPayload(summaryResult.value);
    setMetadataFromSummary(summaryResult.value);
    renderAll({ summary: summaryResult.value, findings, services });
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
    const serviceData = aggregateServicesFromFindings(entries);
    renderAll({ summary, findings: entries, services: serviceData });
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
