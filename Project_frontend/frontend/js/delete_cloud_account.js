import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const accountDetailsContainer = document.getElementById('account-details');
const confirmInput = document.getElementById('confirm-input');
const confirmHelp = document.getElementById('confirm-help');
const deleteButton = document.getElementById('delete-button');
const cancelButton = document.getElementById('cancel-button');
const deleteMessage = document.getElementById('delete-message');

const getQueryParam = (name) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

const buildRedirectUrl = (message, type = 'success') => {
  const params = new URLSearchParams({
    message: message || '',
    message_type: type || 'success',
  });
  return `cloud_accounts.html?${params.toString()}`;
};

const setMessage = (text = '', type = 'error') => {
  if (!deleteMessage) return;
  deleteMessage.textContent = text;
  deleteMessage.classList.remove('success', 'error');
  if (!text) return;
  deleteMessage.classList.add(type);
};

const formatRow = (label, value) =>
  `<div class="account-detail-row"><strong>${label}</strong><span>${value}</span></div>`;

const renderAccountDetails = (account) => {
  if (!accountDetailsContainer) return;

  const accountName = account.account_name || 'Unnamed account';
  const provider = account.provider || 'Cloud provider';
  const uid = account.id || 'N/A';

  accountDetailsContainer.innerHTML = `
    ${formatRow('Account name', accountName)}
    ${formatRow('Provider', provider)}
    ${formatRow('Account ID', uid)}
  `;

  const deleteWord = `delete-${accountName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  confirmHelp.innerHTML = `Type the exact phrase to delete this account: <code>${deleteWord}</code>`;
};

const setButtonState = (enabled) => {
  if (!deleteButton) return;
  deleteButton.disabled = !enabled;
};

const fetchAccount = async (accountId) => {
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/${accountId}/`, { method: 'GET' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to load account details.');
    }
    return payload;
  } catch (error) {
    throw error;
  }
};

const deleteAccount = async (accountId) => {
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/${accountId}/`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail || 'Unable to delete account.');
    }
    return true;
  } catch (error) {
    throw error;
  }
};

const init = async () => {
  requireAuth();

  const accountId = getQueryParam('cloud_account_id');
  const accountNameParam = getQueryParam('account_name') || '';
  const providerParam = getQueryParam('provider') || '';
  if (!accountId) {
    if (accountDetailsContainer) {
      accountDetailsContainer.innerHTML = '<p class="empty-row">Missing cloud account identifier.</p>';
    }
    return;
  }

  let account = null;
  try {
    account = await fetchAccount(accountId);
  } catch (error) {
    account = {
      account_name: accountNameParam || 'Unnamed account',
      provider: providerParam || 'Cloud provider',
      id: accountId,
      region: 'N/A',
      is_connected: false,
      connection_issue: 'Unable to verify account details.',
    };
    setMessage(error?.message || 'Loaded fallback account details.', 'error');
  }

  renderAccountDetails(account);
  if (confirmInput) {
    confirmInput.value = '';
    confirmInput.focus();
  }
  setButtonState(false);

  const deleteWord = `delete-${(account.account_name || accountNameParam || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  confirmInput?.addEventListener('input', (event) => {
    const value = event.target.value.trim();
    setButtonState(value === deleteWord);
    setMessage('');
  });

  deleteButton?.addEventListener('click', async () => {
    if (!confirmInput) return;
    const typed = confirmInput.value.trim();
    if (typed !== deleteWord) {
      setMessage('The confirmation phrase does not match exactly.', 'error');
      return;
    }
    deleteButton.disabled = true;
    setMessage('Deactivating account...', 'success');
    try {
      await deleteAccount(accountId);
      setMessage('Account deactivated successfully. Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = buildRedirectUrl('Account deleted successfully.', 'success');
      }, 1200);
    } catch (error) {
      const errorMessage = error?.message || 'Failed to delete account.';
      setMessage(errorMessage, 'error');
      setTimeout(() => {
        window.location.href = buildRedirectUrl(errorMessage, 'error');
      }, 1200);
    }
  });

  cancelButton?.addEventListener('click', () => {
    window.location.href = 'cloud_accounts.html';
  });
};

init();
