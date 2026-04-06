const syncToggleState = (input, button) => {
  const isVisible = input.type === 'text';
  const label = isVisible ? 'Hide password' : 'Show password';
  button.textContent = isVisible ? 'Hide' : 'Show';
  button.setAttribute('aria-label', label);
  button.classList.toggle('is-visible', isVisible);
};

const attachToggle = (button) => {
  const inputId = button.dataset.toggleFor;
  if (!inputId) return;
  const input = document.getElementById(inputId);
  if (!input) return;

  button.addEventListener('click', (event) => {
    event.preventDefault();
    input.type = input.type === 'password' ? 'text' : 'password';
    syncToggleState(input, button);
  });

  button.addEventListener('mousedown', (event) => event.preventDefault());
  syncToggleState(input, button);
};

export const initPasswordToggles = () => {
  document.querySelectorAll('[data-toggle-for]').forEach(attachToggle);
};
