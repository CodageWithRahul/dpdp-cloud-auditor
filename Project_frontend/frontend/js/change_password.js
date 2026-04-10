import { BASE_URL, fetchWithAuth, requireAuth, clearTokens } from './api.js';
import { initPasswordToggles } from './password-toggle.js';

const form = document.getElementById('change-password-form');
const messageEl = document.getElementById('change-password-message');
const showLoader = () => window.showLoader?.();
const hideLoader = () => window.hideLoader?.();

const setMessage = (text, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.remove('message--error', 'message--success');
  if (type === 'success') {
    messageEl.classList.add('message--success');
  } else {
    messageEl.classList.add('message--error');
  }
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!form) return;

  const oldPassword = document.getElementById('current-password')?.value;
  const newPassword = document.getElementById('new-password')?.value;
  const confirmPassword = document.getElementById('confirm-new-password')?.value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    setMessage('All fields are required.');
    return;
  }

  if (newPassword !== confirmPassword) {
    setMessage('New passwords do not match.');
    return;
  }

  showLoader();
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/change-password/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage = payload?.error || payload?.detail || 'Password change failed.';
      throw new Error(errorMessage);
    }

    setMessage('Password changed successfully. Please log in with the new credentials.', 'success');
    form.reset();
    clearTokens();
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);
  } catch (error) {
    setMessage(error?.message || 'Unable to change password.');
  } finally {
    hideLoader();
  }
};

requireAuth();
form?.addEventListener('submit', handleSubmit);
initPasswordToggles();
