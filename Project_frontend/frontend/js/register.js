import { BASE_URL } from './api.js';
import { initPasswordToggles } from './password-toggle.js';

const registerForm = document.getElementById('register-form');
const registerMessage = document.getElementById('register-message');
const showLoader = () => window.showLoader?.();
const hideLoader = () => window.hideLoader?.();

const setMessage = (element, text, type = 'error') => {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('message--error', 'message--success');
  if (type === 'success') {
    element.classList.add('message--success');
  } else {
    element.classList.add('message--error');
  }
};

const handleRegistration = async (event) => {
  event.preventDefault();
  if (!registerForm) return;

  const username = document.getElementById('reg-username')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;

  if (!username || !email || !password) {
    setMessage(registerMessage, 'All fields are required.');
    return;
  }

  showLoader();
  try {
    const response = await fetch(`${BASE_URL}/api/accounts/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, email, password }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || 'Unable to register at this time.');
    }

    setMessage(registerMessage, 'Account created! Redirecting to login...', 'success');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 800);
  } catch (error) {
    setMessage(registerMessage, error?.message || 'Registration failed.');
  } finally {
    hideLoader();
  }
};

registerForm?.addEventListener('submit', handleRegistration);

initPasswordToggles();
