import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const form = document.getElementById('edit-profile-form');
const messageEl = document.getElementById('edit-profile-message');
const fullNameInput = document.getElementById('full-name');
const emailInput = document.getElementById('email');
const cancelButton = document.getElementById('edit-profile-cancel');

const showLoader = () => window.showLoader?.();
const hideLoader = () => window.hideLoader?.();

const PROFILE_ENDPOINTS = [
  `${BASE_URL}/api/accounts/me/`,
  `${BASE_URL}/api/accounts/profile/`,
  `${BASE_URL}/api/accounts/user/`,
  `${BASE_URL}/api/users/me/`,
];

const setMessage = (text, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.remove('message--error', 'message--success');
  if (!text) return;
  messageEl.classList.add(type === 'success' ? 'message--success' : 'message--error');
};

const resolveFullName = (profile) => {
  if (!profile) return '';
  const explicit = profile.full_name || profile.name || profile.user?.full_name || profile.user?.name;
  if (explicit) return explicit;
  const names = [profile.first_name, profile.last_name].filter(Boolean);
  if (names.length) return names.join(' ');
  return '';
};

const populateForm = (profile) => {
  if (!form) return;
  fullNameInput && (fullNameInput.value = resolveFullName(profile) || '');
  emailInput && (emailInput.value = profile?.email || '');
};

const fetchProfile = async ({ resetMessage = true } = {}) => {
  if (resetMessage) {
    setMessage('');
  }
  showLoader();
  try {
    for (const endpoint of PROFILE_ENDPOINTS) {
      try {
        const response = await fetchWithAuth(endpoint, { method: 'GET' });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setMessage(payload?.detail || payload?.message || 'Profile request failed.');
          continue;
        }

        populateForm(payload);
        if (resetMessage) {
          setMessage('');
        }
        return;
      } catch (error) {
        setMessage(error?.message || 'Unable to load profile.');
      }
    }
    setMessage('Unable to load profile.');
  } finally {
    hideLoader();
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!form) return;

  const fullnameValue = fullNameInput?.value?.trim() ?? '';
  const emailValue = emailInput?.value?.trim() ?? '';

  if (!emailValue) {
    setMessage('Email is required.');
    return;
  }

  showLoader();
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/me/`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        full_name: fullnameValue,
        email: emailValue,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = payload?.error || payload?.detail || 'Profile update failed.';
      throw new Error(errorMessage);
    }

    setMessage('Profile updated successfully.', 'success');
    window.location.assign('user_details.html');
  } catch (error) {
    setMessage(error?.message || 'Unable to update profile.');
  } finally {
    hideLoader();
  }
};

const handleCancel = () => {
  window.location.href = 'user_details.html';
};

requireAuth();
form?.addEventListener('submit', handleSubmit);
cancelButton?.addEventListener('click', handleCancel);
fetchProfile();
