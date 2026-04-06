import { BASE_URL, fetchWithAuth, requireAuth } from "./api.js";

const historyBody = document.getElementById("scan-history-list");

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

const renderRows = (scans = []) => {
  if (!historyBody) return;
  historyBody.innerHTML = "";
  if (!scans.length) {
    historyBody.innerHTML = "<tr><td colspan=\"7\" class=\"empty-row\">No scans recorded yet.</td></tr>";
    return;
  }

  const sorted = [...scans].sort(
    (a, b) =>
      new Date(b.end_time || b.start_time || b.created_at || 0) -
      new Date(a.end_time || a.start_time || a.created_at || 0)
  );
  sorted.forEach((scan) => {
    const row = document.createElement("tr");
    const jobId = scan.scan_id || scan.scan_job_id || scan.job_id || scan.id || "none";
    const account =  scan.cloud_account || "n/a";
    const provider =
      scan.cloud_provider || scan.provider || scan.account_provider || scan.provider_name || "�";
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
      <td></td>
      <td>${issues}</td>
      <td>${parsed}</td>
      <td></td>`;
    row.querySelector("td:nth-child(4)")?.appendChild(chip);
    const actionCell = row.querySelector("td:nth-child(7)");
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

const loadHistory = async () => {
  try {
    const response = await fetchWithAuth(BASE_URL + "/api/scanner/scan/history/", { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.detail || "Unable to load scan history.");
    }
    renderRows(Array.isArray(payload) ? payload : []);
  } catch (error) {
    historyBody.innerHTML = "<tr><td colspan=\"7\" class=\"empty-row\">Failed to load history.</td></tr>";
  }
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
};

init();
