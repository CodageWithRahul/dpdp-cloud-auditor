import { BASE_URL } from './api.js';

const form = document.getElementById('forgot-password-form');
const messageEl = document.getElementById('forgot-password-message');
const showLoader = () => window.showLoader?.();
const hideLoader = () => window.hideLoader?.();

const setMessage = (text, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.classList.remove('message--error', 'message--success');
  messageEl.classList.add(type === 'success' ? 'message--success' : 'message--error');
};

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!form) return;

  const email = document.getElementById('reset-email')?.value.trim();

  if (!email) {
    setMessage('Email is required.');
    return;
  }

  showLoader();
  try {
    const response = await fetch(`${BASE_URL}/api/accounts/password-reset/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || 'Unable to send reset link.');
    }

    setMessage(payload?.message || 'If we find an account for that email, a reset link was sent.', 'success');
    form.reset();
  } catch (error) {
    setMessage(error?.message || 'Unable to send reset link.');
  } finally {
    hideLoader();
  }
};

form?.addEventListener('submit', handleSubmit);
