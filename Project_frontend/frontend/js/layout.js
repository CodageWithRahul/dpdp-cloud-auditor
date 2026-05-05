import { BASE_URL, fetchWithAuth, clearTokens } from './api.js';
import { startScanMonitor } from "./scanMonitor.js";


const navLinks = [
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html' },
  { id: 'cloud-accounts', label: 'Cloud Accounts', href: 'cloud_accounts.html' },
  { id: 'scan-history', label: 'Scan History', href: 'scan_history.html' },
  { id: 'reports', label: 'Reports', href: 'report.html' },
];


const buildNav = (active) => `
<header class="top-nav">
<div class="brand-logo">
  <a href="./dashboard.html">
    <img src="../imgs/logo.png" alt="DPDP Cloud Auditor" class="logo-img">
  </a>
</div>
  <button class="nav-toggle" type="button" aria-label="Toggle navigation">
    <span></span>
    <span></span>
    <span></span>
  </button>

  <nav class="primary-nav">
    ${navLinks
    .map(
      (link) =>
        `<a class="nav-link${link.id === active ? ' active' : ''}" href="${link.href}">${link.label}</a>`
    )
    .join('')}
    <div class="nav-user-mobile">
      <a id="user-name-mobile" class="user-link" href="user_details.html">Security Analyst</a>
      <button class="btn ghost" id="logout-button-mobile">Logout</button>
    </div>
    
  </nav>
  <div class="nav-user">
   ${scanIndicator}
    <div>
      <a id="user-name" class="user-link" href="user_details.html">Security Analyst</a>
    </div>
    <button class="btn ghost" id="logout-button">Logout</button>
  </div>
</header>`;


const renderNav = (active) => {
  const root = document.getElementById('shell-nav');
  if (!root) return;
  root.innerHTML = buildNav(active);
};

const renderFooter = () => {
  const root = document.getElementById('shell-footer');
  if (!root) return;
  root.className = 'app-footer';
  root.innerHTML = '<p>&copy; 2026 Cloud Auditor. Built for professional cloud security teams.</p>';
};

const attachLogout = () => {
  const buttons = [
    document.getElementById('logout-button'),
    document.getElementById('logout-button-mobile'),
  ];
  buttons.forEach((button) => {
    button?.addEventListener('click', () => {
      clearTokens();
      window.location.href = 'login.html';
    });
  });
};

const formatDisplayName = (payload) => {
  const fullName = [payload?.first_name, payload?.last_name].filter(Boolean).join(' ').trim();
  return fullName || payload?.email || payload?.username || 'Security Analyst';
};

const loadUserInfo = async () => {
  const nameEls = [
    document.getElementById('user-name'),
    document.getElementById('user-name-mobile'),
  ];
  const roleEl = document.getElementById('user-role');
  if (!nameEls.some(Boolean) && !roleEl) return;

  const endpoints = [
    `${BASE_URL}/api/accounts/me/`,
    `${BASE_URL}/api/accounts/profile/`,
    `${BASE_URL}/api/users/me/`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetchWithAuth(endpoint, { method: 'GET' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) continue;
      const displayName = formatDisplayName(payload);
      nameEls.forEach((el) => {
        if (el) {
          el.textContent = displayName;
        }
      });
      roleEl && (roleEl.textContent = payload?.role || 'Operator');
      return;
    } catch (error) {
      // try next endpoint
    }
  }

  nameEls.forEach((el) => {
    if (el) {
      el.textContent = 'Security Analyst';
    }
  });
  roleEl && (roleEl.textContent = 'Operator');
};

const closeNavMenu = () => {
  const header = document.querySelector('.top-nav');
  header?.classList.remove('nav-open');
};

const attachNavToggle = () => {
  const header = document.querySelector('.top-nav');
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.primary-nav');
  toggle?.addEventListener('click', () => {
    header?.classList.toggle('nav-open');
  });
  nav?.querySelectorAll('a.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      closeNavMenu();
    });
  });
};

export const initShell = (activePage = 'dashboard') => {
  renderNav(activePage);
  renderFooter();
  loadUserInfo();
  attachLogout();
  attachNavToggle();
};


try {
  const activeScan = JSON.parse(localStorage.getItem("activeScan"));

  if (activeScan?.jobId) {
    startScanMonitor();
  }
} catch (e) {
  console.warn("Invalid activeScan in storage");
}

const activeScan = JSON.parse(localStorage.getItem("activeScan") || "null");

const scanIndicator = activeScan
  ? `
  <a class="scan-indicator" href="scanning.html?scan_job_id=${activeScan.jobId}">
      <span class="scan-loader"></span>
      <span class="scan-text">Scan #${activeScan.jobId}</span>
  </a>
  `
  : "";
