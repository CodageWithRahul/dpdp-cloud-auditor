import { BASE_URL, fetchWithAuth, requireAuth } from "./api.js";

const historyBody = document.getElementById("scan-history-list");
const providerFilter = document.getElementById("scan-provider-filter");
const dateFromFilter = document.getElementById("scan-date-from");
const dateToFilter = document.getElementById("scan-date-to");
const filterButton = document.getElementById("scan-filter-apply");
const resetButton = document.getElementById("scan-filter-reset");

let historyCache = [];

const statusLabel = (text) => {
  if (!text) return "Completed";
  const normalized = text.toString().toLowerCase();
  if (normalized.includes("running") || normalized.includes("pending")) return "Running";
  if (normalized.includes("fail") || normalized.includes("error")) return "Failed";
  return "Completed";
};

const statusClass = (label) => {
  const normalized = label.toLowerCase();
  if (normalized.includes("running")) return "running";
  if (normalized.includes("failed")) return "failed";
  return "completed";
};

const normalizeProvider = (scan) =>
  (scan.cloud_provider || scan.provider || scan.account_provider || scan.provider_name || "")
    .toString()
    .trim();

const getScanDateValue = (scan) => scan.end_time || scan.start_time || scan.created_at || "";

const normalizeRegions = (scan) => {
  const regions = scan.region || [];

  if (regions.length === 0) return "n/a";

  if (regions.length === 1) return regions[0];

  const extra = regions.length - 1;

  return `
    <span class="region-main">${regions[0]}</span>
    <span class="region-pill">+${extra}</span>
  `;
};



const renderRows = (scans = []) => {
  if (!historyBody) return;
  historyBody.innerHTML = "";
  if (!scans.length) {
    historyBody.innerHTML = "<tr><td colspan=\"8\" class=\"empty-row\">No scans recorded yet.</td></tr>";
    return;
  }

  const sorted = [...scans].sort(
    (a, b) =>
      new Date(getScanDateValue(b) || 0) -
      new Date(getScanDateValue(a) || 0)
  );
  sorted.forEach((scan) => {
    // console.log(scan);

    const row = document.createElement("tr");
    const jobId = scan.scan_id || scan.scan_job_id || scan.job_id || scan.id || "none";
    const account =  scan.cloud_account || "n/a";
    const provider = normalizeProvider(scan) || "�";
    const region = normalizeRegions(scan) || "�";
    const statusText = statusLabel(scan.status);
    const issues = scan.issues_found ?? scan.findings_count ?? scan.findings ?? 0;
    const date = scan.end_time || scan.start_time || scan.created_at || "�";
    const parsed = date === "�" ? "�" : new Date(date).toLocaleString();
    const chip = document.createElement("span");
    chip.className = "status-chip " + statusClass(statusText);
    chip.textContent = statusText;

    row.innerHTML = `
      <td>${jobId}</td>
      <td>${account}</td>
      <td>${provider}</td>
      <td>${region}</td>
      <td></td>
      <td>${issues}</td>
      <td>${parsed}</td>
      <td></td>`;
    row.querySelector("td:nth-child(5)")?.appendChild(chip);
    const actionCell = row.querySelector("td:nth-child(8)");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ghost";
    btn.textContent = "View Report";
    if (jobId !== "none") {
      btn.dataset.reportId = jobId;
    } else {
      btn.disabled = true;
    }
    actionCell?.appendChild(btn);
    historyBody.appendChild(row);
  });
};

let currentPage = 1;
let nextPage = null;
let prevPage = null;
const loadHistory = async (page = 1) => {
  try {
    const response = await fetchWithAuth(
      `${BASE_URL}/api/scanner/scan/history/?page=${page}`,
      { method: "GET" }
    );

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.detail || "Unable to load scan history.");
    }

    const results = payload?.results || [];

    historyCache = results;
    renderRows(historyCache);

    // 🔥 update pagination state
    currentPage = page;
    nextPage = payload.next;
    prevPage = payload.previous;

    updatePaginationUI();

  } catch (error) {
    console.error(error);
    historyBody.innerHTML =
      '<tr><td colspan="8" class="empty-row">Failed to load history.</td></tr>';
  }
};

const updatePaginationUI = () => {
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");
  const pageInfo = document.getElementById("page-info");

  if (pageInfo) {
    pageInfo.textContent = `Page ${currentPage}`;
  }

  if (prevBtn) {
    prevBtn.disabled = !prevPage;
  }

  if (nextBtn) {
    nextBtn.disabled = !nextPage;
  }
};

document.getElementById("next-page-btn")?.addEventListener("click", () => {
  if (!nextPage) return;
  loadHistory(currentPage + 1);
});

document.getElementById("prev-page-btn")?.addEventListener("click", () => {
  if (!prevPage) return;
  loadHistory(currentPage - 1);
});

const matchesProvider = (scan, filterValue) => {
  if (!filterValue) return true;
  return normalizeProvider(scan).toLowerCase().includes(filterValue.toLowerCase());
};

const matchesDateRange = (scan, from, to) => {
  if (!from && !to) return true;
  const dateValue = getScanDateValue(scan);
  if (!dateValue) return false;
  const timestamp = new Date(dateValue).getTime();
  if (from && timestamp < from.getTime()) return false;
  if (to && timestamp > to.getTime()) return false;
  return true;
};

const applyFilters = () => {
  if (!historyCache.length) {
    renderRows([]);
    return;
  }

  const providerQuery = providerFilter?.value?.trim() ?? "";
  const from = dateFromFilter?.value ? new Date(dateFromFilter.value) : null;
  const to = dateToFilter?.value ? new Date(dateToFilter.value) : null;
  if (to) {
    to.setHours(23, 59, 59, 999);
  }

  const filtered = historyCache.filter(
    (scan) =>
      matchesProvider(scan, providerQuery) &&
      matchesDateRange(scan, from, to || null)
  );

  renderRows(filtered);
};

const handleReportClick = (event) => {
  const button = event.target.closest("button[data-report-id]");
  if (!button) return;
  window.location.href = "report.html?scan_job_id=" + encodeURIComponent(button.dataset.reportId);
};

const init = () => {
  requireAuth();
  loadHistory();
  historyBody?.addEventListener("click", handleReportClick);
  filterButton?.addEventListener("click", applyFilters);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      applyFilters();
    }
  });
  resetButton?.addEventListener("click", () => {
    providerFilter && (providerFilter.value = "");
    dateFromFilter && (dateFromFilter.value = "");
    dateToFilter && (dateToFilter.value = "");
    renderRows(historyCache);
  });
};

init();
