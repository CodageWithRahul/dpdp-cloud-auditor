import { BASE_URL, fetchWithAuth } from "./api.js";

const STATUS_URL = `${BASE_URL}/api/scanner/scan/status/{scan_job_id}/`;
const REPORT_BASE = `${BASE_URL}/api/reports`;
const POLL_INTERVAL = 4000;

let timer = null;
let redirecting = false;

let pollFailures = 0;
const MAX_FAILURES = 5;
const WARNING_THRESHOLD = 2;

const isTerminal = (status = "") => {

  status = status.toLowerCase();

  return [
    "completed",
    "complete",
    "failed",
    "stopped",
    "finished",
    "cancelled"
  ].some(s => status.includes(s));

};

const buildReportUrl = (job) => {

  const url = new URL("report.html", window.location.href);
  url.searchParams.set("scan_job_id", job.jobId);

  return url.toString();

};

const checkReportReady = async (job) => {

  try {

    const res = await fetchWithAuth(`${REPORT_BASE}/${job.jobId}/summary/`);

    if (res.ok) return true;

    if (res.status === 404) return false;

  } catch (err) {

    console.warn("Report check failed", err);

  }

  return false;

};

const stopMonitor = () => {

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

};

const checkStatus = async () => {

  const job = JSON.parse(localStorage.getItem("activeScan") || "null");

  if (!job?.jobId) {
    stopMonitor();
    return;
  }

  try {

    const url = STATUS_URL.replace("{scan_job_id}", job.jobId);
    const res = await fetchWithAuth(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const scan = await res.json();
    const status = (scan.status || "").toLowerCase();

    // ✅ RESET failure count on success
    pollFailures = 0;

    if (!isTerminal(status)) return;

    const reportReady = await checkReportReady(job);
    if (!reportReady) return;

    stopMonitor();
    localStorage.removeItem("activeScan");

    if (!redirecting) {
      redirecting = true;
      window.location.href = buildReportUrl(job);
    }

  } catch (e) {

    pollFailures++;

    console.warn(`Scan monitor error (${pollFailures})`, e);

    // ⚠️ Temporary issue → do nothing
    if (pollFailures < WARNING_THRESHOLD) return;

    // ⚠️ Show reconnecting message
    if (pollFailures < MAX_FAILURES) {
      showMonitorMessage("Reconnecting to server...");
    console.log("Reconnecting to scan status...");

      return;
    }

    // ❌ HARD FAIL
    stopMonitor();

    showMonitorMessage(
      "Backend is not responding. Scan status unknown. Please refresh or try again.",
      "error"
    );

    // Optional cleanup
    console.log("Max scan monitor failures reached. Stopping monitor and clearing active scan.");
    localStorage.removeItem("activeScan");

  }

};

const showMonitorMessage = (text, type = "info") => {
  const el = document.getElementById("report-message");
  if (!el) return;

  el.textContent = text;
  el.className = `message ${type}`;
};

export const startScanMonitor = () => {

  if (timer) return;

  const job = JSON.parse(localStorage.getItem("activeScan") || "null");
  if (!job?.jobId) return;

  const poll = async () => {
    await checkStatus();

    if (timer !== null) {
      timer = setTimeout(poll, getPollInterval());
    }
  };

  timer = setTimeout(poll, 0);
};

const getPollInterval = () => {
  return Math.min(10000, 4000 + pollFailures * 2000);
};