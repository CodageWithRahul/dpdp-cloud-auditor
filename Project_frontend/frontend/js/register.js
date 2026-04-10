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

  const fullName = document.getElementById('reg-full-name')?.value.trim();
  const email = document.getElementById('reg-email')?.value.trim();
  const password = document.getElementById('reg-password')?.value;
  const confirmPassword = document.getElementById('reg-password-confirm')?.value;

  if (!fullName || !email || !password || !confirmPassword) {
    setMessage(registerMessage, 'Full name, email, password, and confirmation are required.');
    return;
  }

  if (password !== confirmPassword) {
    setMessage(registerMessage, 'Passwords do not match.');
    return;
  }

  showLoader();
  try {
    const response = await fetch(`${BASE_URL}/api/accounts/register/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ full_name: fullName, email, password }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      let errorMessage = payload?.detail;
      if (!errorMessage && payload && typeof payload === 'object') {
        const firstKey = Object.keys(payload)[0];
        const errorValue = payload[firstKey];
        if (Array.isArray(errorValue)) {
          errorMessage = errorValue.join(' ');
        } else if (typeof errorValue === 'string') {
          errorMessage = errorValue;
        }
      }
      throw new Error(errorMessage || 'Unable to register at this time.');
    }

    setMessage(registerMessage, 'Account created! Redirecting to login...', 'success');
    window.location.href = 'login.html';
  } catch (error) {
    setMessage(registerMessage, error?.message || 'Registration failed.');
  } finally {
    hideLoader();
  }
};

registerForm?.addEventListener('submit', handleRegistration);

initPasswordToggles();
