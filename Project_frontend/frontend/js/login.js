import { BASE_URL, setTokens } from './api.js';
import { initPasswordToggles } from './password-toggle.js';

const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
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

const handleLogin = async (event) => {
  event.preventDefault();
  if (!loginForm) return;

  const username = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value;

  if (!username || !password) {
    setMessage(loginMessage, 'Username and password are required.');
    return;
  }

  showLoader();
  try {
    const response = await fetch(`${BASE_URL}/api/accounts/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || 'Invalid credentials.');
    }

    if (!payload.access || !payload.refresh) {
      throw new Error('Server did not return tokens.');
    }

    setTokens(payload);
    setMessage(loginMessage, 'Login successful! Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 600);
  } catch (error) {
    setMessage(loginMessage, error?.message || 'Unable to login at the moment.');
  } finally {
    hideLoader();
  }
};

loginForm?.addEventListener('submit', handleLogin);

initPasswordToggles();
