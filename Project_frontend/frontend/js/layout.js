import { BASE_URL, fetchWithAuth, clearTokens } from './api.js';

const navLinks = [
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html' },
  { id: 'cloud-accounts', label: 'Cloud Accounts', href: 'cloud_accounts.html' },
  { id: 'scan-history', label: 'Scan History', href: 'scan_history.html' },
  { id: 'reports', label: 'Reports', href: 'report.html' },
];

const buildNav = (active) => `
<header class="top-nav">
  <div class="brand-logo">
    <p class="eyebrow">Security Console</p>
    <h1>Cloud Auditor</h1>
  </div>
  <nav class="primary-nav">
    ${navLinks
      .map(
        (link) =>
          `<a class="nav-link${link.id === active ? ' active' : ''}" href="${link.href}">${link.label}</a>`
      )
      .join('')}
  </nav>
  <div class="nav-user">
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
  const button = document.getElementById('logout-button');
  button?.addEventListener('click', () => {
    clearTokens();
    window.location.href = 'login.html';
  });
};

const formatDisplayName = (payload) => {
  const fullName = [payload?.first_name, payload?.last_name].filter(Boolean).join(' ').trim();
  return fullName || payload?.email || payload?.username || 'Security Analyst';
};

const loadUserInfo = async () => {
  const nameEl = document.getElementById('user-name');
  const roleEl = document.getElementById('user-role');
  if (!nameEl && !roleEl) return;

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
      nameEl && (nameEl.textContent = displayName);
      roleEl && (roleEl.textContent = payload?.role || 'Operator');
      return;
    } catch (error) {
      // try next endpoint
    }
  }

  nameEl && (nameEl.textContent = 'Security Analyst');
  roleEl && (roleEl.textContent = 'Operator');
};

export const initShell = (activePage = 'dashboard') => {
  renderNav(activePage);
  renderFooter();
  loadUserInfo();
  attachLogout();
};
