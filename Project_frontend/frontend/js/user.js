import { BASE_URL, fetchWithAuth, requireAuth, clearTokens } from './api.js';

const usernameEl = document.getElementById('profile-username');
const emailEl = document.getElementById('profile-email');
const fullNameEl = document.getElementById('profile-full-name');
const initialsEl = document.getElementById('profile-initials');
const createdEl = document.getElementById('profile-created');
const lastLoginEl = document.getElementById('profile-last-login');
const messageEl = document.getElementById('profile-message');
const refreshButton = document.getElementById('refresh-user');
const updateButton = document.getElementById('update-details');
const changePasswordButton = document.getElementById('change-password');
const logoutButtons = [...document.querySelectorAll('#sidebar-logout, #top-logout')];

const PROFILE_ENDPOINTS = [
  `${BASE_URL}/api/accounts/me/`,
  `${BASE_URL}/api/accounts/profile/`,
  `${BASE_URL}/api/accounts/user/`,
  `${BASE_URL}/api/users/me/`,
];

const setMessage = (text, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.remove('error', 'success');
  if (!text) return;
  messageEl.classList.add(type);
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const resolveFullName = (profile) => {
  if (!profile) return '—';
  const explicit = profile.full_name || profile.name || profile.user?.full_name || profile.user?.name;
  if (explicit) return explicit;
  const names = [profile.first_name, profile.last_name].filter(Boolean);
  if (names.length) return names.join(' ');
  return '—';
};

const deriveInitials = (fullName, username) => {
  const source = fullName && fullName !== '—' ? fullName : username;
  if (!source) return '—';
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return source.slice(0, 2).toUpperCase();
  const initials = [parts[0]?.[0], parts[1]?.[0]].filter(Boolean).join('');
  return initials.length ? initials.toUpperCase() : source.slice(0, 2).toUpperCase();
};

const renderProfile = (profile) => {
  const username = profile?.username || '—';
  const fullName = resolveFullName(profile);
  usernameEl && (usernameEl.textContent = username);
  fullNameEl && (fullNameEl.textContent = fullName);
  initialsEl && (initialsEl.textContent = deriveInitials(fullName, username));
  emailEl && (emailEl.textContent = profile?.email || '—');
  createdEl && (createdEl.textContent = formatDate(profile?.date_joined || profile?.created_at));
  lastLoginEl && (lastLoginEl.textContent = formatDate(profile?.last_login));
};

const fetchProfile = async () => {
  setMessage('');
  for (const endpoint of PROFILE_ENDPOINTS) {
    try {
      const response = await fetchWithAuth(endpoint, { method: 'GET' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.detail || payload?.message || 'Profile request failed.');
        continue;
      }
      renderProfile(payload);
      setMessage('');
      return;
    } catch (error) {
      setMessage(error?.message || 'Unable to load profile.');
    }
  }
  renderProfile(null);
};

refreshButton?.addEventListener('click', fetchProfile);
updateButton?.addEventListener('click', () => setMessage('Please use the API to update profile data.', 'success'));
changePasswordButton?.addEventListener('click', () => setMessage('Password management is handled by the backend.', 'success'));
logoutButtons.forEach((button) => {
  button?.addEventListener('click', () => {
    clearTokens();
    window.location.href = 'login.html';
  });
});

requireAuth();
fetchProfile();
