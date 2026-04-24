import { BASE_URL, fetchWithAuth } from "./api.js";

const STATUS_URL = `${BASE_URL}/api/scanner/scan/status/{scan_job_id}/`;
const REPORT_BASE = `${BASE_URL}/api/reports`;
const POLL_INTERVAL = 4000;

let timer = null;
let redirecting = false;

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

    if (!res.ok) return;

    const scan = await res.json();

    const status = (scan.status || "").toLowerCase();

    console.log("Scan status:", status);

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

    console.warn("Scan monitor error", e);

  }

};

export const startScanMonitor = () => {

  if (timer) return;

  const job = JSON.parse(localStorage.getItem("activeScan") || "null");

  if (!job?.jobId) return;

  timer = setInterval(checkStatus, POLL_INTERVAL);

  // run immediately once
  checkStatus();

};