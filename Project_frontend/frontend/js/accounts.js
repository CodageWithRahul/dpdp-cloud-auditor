import { BASE_URL, fetchWithAuth, requireAuth } from "./api.js";
import { showLoader, hideLoader } from "../components/loader/loader.js";

const accountsTableBody = document.getElementById("cloud-accounts-table");
const accountsCardList = document.getElementById("cloud-accounts-cards");
const accountsMessage = document.getElementById("cloud-accounts-message");

let accountsCache = [];

const CACHE_KEY = 'cloud_accounts_status';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

const getCachedStatus = (accountId) => {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const accountCache = cache[accountId];
    if (!accountCache) return null;

    // Check if cache is expired
    if (Date.now() - accountCache.timestamp > CACHE_EXPIRY) {
      delete cache[accountId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return accountCache;
  } catch (e) {
    return null;
  }
};

const setCachedStatus = (accountId, status) => {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[accountId] = {
      ...status,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    // Ignore cache errors
  }
};

const providerNames = {
  AWS: "Amazon Web Services",
  AZURE: "Microsoft Azure",
  GCP: "Google Cloud Platform",
};

const getQueryParam = (name) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

const setMessage = (text = "", type = "success") => {
  if (!accountsMessage) return;
  accountsMessage.textContent = text;
  accountsMessage.classList.remove("error", "success");
  if (!text) return;
  accountsMessage.classList.add(type);
};

const clearMessageQuery = () => {
  if (!window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('message');
  url.searchParams.delete('message_type');
  window.history.replaceState({}, document.title, url.pathname + url.search);
};

const renderAccountCards = (accounts = accountsCache) => {
  if (!accountsCardList) return;
  accountsCardList.innerHTML = "";

  if (!accounts.length) {
    accountsCardList.innerHTML =
      '<p class="empty-row">No cloud accounts configured.</p>';
    return;
  }

  accounts.forEach((account) => {
    const providerLabel =
      providerNames[(account.provider || "").toUpperCase()] ||
      account.provider ||
      "Cloud";

    const accountName = account.account_name || "Unnamed account";

    const cachedStatus = getCachedStatus(account.id);
    const statusText = cachedStatus
      ? cachedStatus.is_connected
        ? "Connected"
        : "Not connected"
      : "Checking...";

    const statusClass = cachedStatus
      ? cachedStatus.is_connected
        ? "status-connected"
        : "status-error"
      : "status-pending";

    const dotClass = cachedStatus
      ? cachedStatus.is_connected
        ? "connected"
        : "error"
      : "checking";

    const card = document.createElement("article");
    card.className = "mobile-account-card";

    card.innerHTML = `
      <header class="mobile-card-header">

        <div class="mobile-card-title">
          <span class="mobile-status-dot ${dotClass}" id="dot-${account.id}"></span>

          <div>
            <strong>${accountName}</strong>
            <span class="provider-pill simple">${providerLabel}</span>
          </div>
        </div>

        <div class="mobile-card-top-right">

          <button
            class="status-refresh"
            data-action="refresh"
            data-id="${account.id}"
            aria-label="Refresh connection status"
            title="Refresh connection status"
          >
            <span aria-hidden="true">&#x21bb;</span>
          </button>

          <span
            class="status-text ${statusClass}"
            id="status-text-${account.id}"
          >
            ${statusText}
          </span>

        </div>

      </header>

      <div class="mobile-action-buttons">
        <button class="btn ghost" data-action="edit" data-id="${account.id}">
          Edit
        </button>

        <button class="btn ghost" data-action="delete" data-id="${account.id}">
          Delete
        </button>
      </div>
    `;

    accountsCardList.appendChild(card);
  });
};

const renderAccounts = (accounts = accountsCache) => {
  if (!accountsTableBody) return;
  accountsTableBody.innerHTML = "";
  if (!accounts.length) {
    const empty = document.createElement("tr");
    empty.innerHTML = "<td colspan=\"5\" class=\"empty-row\">No cloud accounts configured.</td>";
    accountsTableBody.appendChild(empty);
    return;
  }



  accounts.forEach((account) => {
    const tr = document.createElement("tr");
    const providerLabel = providerNames[(account.provider || "").toUpperCase()] || account.provider || "Cloud";
    const accountName = account.account_name || "Unnamed account";
    // Get cached status
    const cachedStatus = getCachedStatus(account.id);
    const statusDot = cachedStatus ? (cachedStatus.is_connected ? '🟢' : '🔴') : '⚪';

    tr.innerHTML =
      "<td class=\"status-dot\">" + statusDot + "</td>" +
      "<td><span class=\"provider-pill simple\">" + providerLabel + "</span></td>" +
      "<td><strong>" + accountName + "</strong></td>" +
      "<td id='status-" + account.id + "'>" +
      '<span class="status-badge status-pending">Checking...</span>' +
      "</td>" +
      "<td class=\"actions-cell\">" +
      "  <div class=\"action-buttons\">" +
      "    <button type=\"button\" class=\"status-refresh\" data-action=\"refresh\" data-id=\"" + account.id + "\" aria-label=\"Refresh connection status\" title=\"Refresh connection status\">" +
      "      <span aria-hidden=\"true\">&#x21bb;</span>" +
      "    </button>" +
      "    <button class=\"btn ghost\" data-action=\"edit\" data-id=\"" + account.id + "\">Edit</button>" +
      "    <button class=\"btn ghost\" data-action=\"delete\" data-id=\"" + account.id + "\">Delete</button>" +
      "  </div>" +
      "</td>";
    accountsTableBody.appendChild(tr);
  });

  accounts.forEach((account) => {
    checkConnectionStatus(account, false); // false = use cache if available
  });
  renderAccountCards(accounts);
};

const fetchAccounts = async () => {
  try {
    const response = await fetchWithAuth(BASE_URL + "/api/accounts/cloud-accounts/", { method: "GET" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.detail || "Unable to load cloud accounts.");
    }
    accountsCache = Array.isArray(payload) ? payload : [];
    // renderAccounts();
  } catch (error) {
    setMessage(error?.message || "Failed to load cloud accounts.", "error");
    accountsCache = [];
    renderAccounts();
  }
};

// const startScan = async (account) => {
//   if (!account) return;
//   setMessage("Starting scan for " + (account.account_name || "account") + "...", "success");
//   try {
//     const response = await fetchWithAuth(BASE_URL + "/api/scanner/start/", {
//       method: "POST",
//       body: JSON.stringify({ cloud_account_id: account.id, region: account.region || "ALL" }),
//     });
//     const payload = await response.json().catch(() => ({}));
//     if (!response.ok) {
//       throw new Error(payload?.detail || "Scan request failed.");
//     }
//     setMessage(payload?.message || "Scan queued.", "success");
//   } catch (error) {
//     setMessage(error?.message || "Unable to start scan.", "error");
//   }
// };

const deleteAccount = async (accountId) => {
  if (!window.confirm("Delete this cloud account configuration?")) return;
  try {
    const response = await fetchWithAuth(BASE_URL + "/api/accounts/cloud-accounts/" + accountId + "/", { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail || "Unable to delete account.");
    }
    setMessage("Account deleted.", "success");
    fetchAccounts();
  } catch (error) {
    setMessage(error?.message || "Failed to delete account.", "error");
  }
};

const handleTableClick = (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  const targetAccount = accountsCache.find((account) => account.id.toString() === id);
  if (action === "scan") {
    return startScan(targetAccount);
  }
  if (action === "refresh") {
    return checkConnectionStatus(targetAccount, true); // true = force refresh
  }
  if (action === "edit") {
    window.location.href = `add_account.html?cloud_account_id=${encodeURIComponent(id)}`;
    return;
  }
  if (action === "delete") {
    const accountName = targetAccount?.account_name || '';
    const provider = targetAccount?.provider || '';
    const params = new URLSearchParams({
      cloud_account_id: id,
      account_name: accountName,
      provider,
    });
    window.location.href = `delete_cloud_account.html?${params.toString()}`;
    return;
  }
};

const init = async () => {
  requireAuth();

  await fetchAccounts();

  renderAccounts();

  const redirectMessage = getQueryParam('message');
  const redirectMessageType = getQueryParam('message_type') || 'success';
  if (redirectMessage) {
    setMessage(redirectMessage, redirectMessageType);
    clearMessageQuery();
  }

  accountsTableBody?.addEventListener("click", handleTableClick);
  accountsCardList?.addEventListener("click", handleTableClick);
};

init();

const updateAccountCardStatus = (accountId, state, message) => {
  const dot = document.getElementById(`dot-${accountId}`);
  const statusText = document.getElementById(`status-text-${accountId}`);
  if (dot) {
    dot.className = `mobile-status-dot ${state}`;
  }
  if (statusText) {
    const text = state === 'connected' ? 'Connected' : state === 'checking' ? 'Checking...' : message || 'Not connected';
    statusText.textContent = text;
    statusText.className = `status-text ${state === 'connected' ? 'status-connected' : state === 'checking' ? 'status-checking' : 'status-error'}`;
  }
};

const updateStatusDot = (accountId, isConnected) => {
  const row = document
    .querySelector(`#status-${accountId}`)
    ?.closest("tr");

  if (!row) return;

  const dotCell = row.querySelector(".status-dot");
  if (!dotCell) return;

  let svg = "";

  if (isConnected === null) {
    svg = `
      <svg width="20" height="20" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="#9ca3af"/>
      </svg>`;
  }
  else if (isConnected) {
    svg = `
      <svg width="20" height="20" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="#22c55e"/>
      </svg>`;
  }
  else {
    svg = `
      <svg width="20" height="20" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="#ef4444"/>
      </svg>`;
  }

  dotCell.innerHTML = svg;
};

const checkConnectionStatus = async (account, forceRefresh = false) => {

  const cell = document.getElementById("status-" + account.id);
  const cachedStatus = getCachedStatus(account.id);

  // Use cached status
  if (!forceRefresh && cachedStatus) {
    if (cell) {
      cell.innerHTML = cachedStatus.is_connected
        ? '<span class="status-badge status-connected">Connected</span>'
        : '<span class="status-badge status-error">Not connected</span>';
    }
    updateStatusDot(account.id, cachedStatus.is_connected);
    updateAccountCardStatus(account.id, cachedStatus.is_connected ? 'connected' : 'error', cachedStatus.connection_issue);
    return cachedStatus;
  }

  // Show checking state
  if (cell) {
    cell.innerHTML =
      '<span class="status-badge status-checking">Checking...</span>';
    updateStatusDot(account.id, null);
  }
  updateAccountCardStatus(account.id, 'checking');

  if (forceRefresh) {
    showLoader();
  }

  try {

    const res = await fetchWithAuth(
      BASE_URL + "/api/accounts/cloud-accounts/" + account.id + "/connection-status/",
      { method: "GET" }
    );

    if (!res.ok) {
      throw new Error("API request failed");
    }

    const data = await res.json();

    // Cache result
    setCachedStatus(account.id, {
      is_connected: data.is_connected,
      connection_issue: data.connection_issue
    });

    // Update UI immediately
    if (cell) {

      if (data.is_connected) {

        cell.innerHTML =
          '<span class="status-badge status-connected">Connected</span>';
        updateStatusDot(account.id, true);
        updateAccountCardStatus(account.id, 'connected');

      } else {

        cell.innerHTML =
          '<span class="status-badge status-error">Not connected</span>';
        updateStatusDot(account.id, false);

        if (data.connection_issue) {
          showConnectionIssue(account, data.connection_issue);
        }
        updateAccountCardStatus(account.id, 'error', data.connection_status);
      }
    }

    return data;

  } catch (err) { 

    console.error("Connection check error:", err);
    if (cell) {
      cell.innerHTML =
        '<span class="status-badge status-error">Check failed</span>';
      updateStatusDot(account.id, false);
    }
    updateAccountCardStatus(account.id, 'error', 'Check failed');

    return null;

  } finally {

    if (forceRefresh) {
      hideLoader();
    }

  }
};
const getSolution = (error) => {

  if (!error) return "Unknown error.";

  if (error.includes("InvalidClientTokenId")) {
    return "Your AWS Access Key or Secret Key is invalid. Please verify your credentials.";
  }

  if (error.includes("InvalidPadding") || error.includes("PEM")) {
    return "Your GCP service account key appears corrupted. Upload the correct JSON key file.";
  }

  if (error.includes("Unauthorized") || error.includes("permission")) {
    return "The account does not have required permissions. Check IAM roles.";
  }

  return "Check your credentials and cloud permissions.";
};

const issuesContainer = document.getElementById("connection-issues-container");

const showConnectionIssue = (account, error) => {

  if (!issuesContainer) return;

  const solution = getSolution(error);

  const card = document.createElement("div");
  card.className = "issue-card";

  card.innerHTML =
    "<div class='issue-title'>⚠ Connection issue with " +
    account.provider + " Account Name : " + account.account_name +
    "</div>" +
    "<div><strong>Error:</strong> " +
    error +
    "</div>" +
    "<div class='issue-solution'><strong>Suggested fix:</strong> " +
    solution +
    "</div>";

  issuesContainer.appendChild(card);
};
