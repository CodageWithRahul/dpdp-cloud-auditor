import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';
import { showLoader, hideLoader } from '../components/loader/loader.js';
console.log("ADD ACCOUNT JS LOADED");
let accountForm;
let formMessage;
let providerSelect;
let nameInput;
let accessInput;
let secretInput;
let sessionInput;
let tenantInput;
let clientInput;
let clientSecretInput;
let subscriptionInput;
let gcpFileInput;
let gcpJsonInput;
let credentialSections = [];
let editingAccountId = null;
let originalProvider = null;

const getQueryParam = (name) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

const setMessage = (text = '', type = 'error') => {
  if (!formMessage) return;
  formMessage.textContent = text;
  formMessage.classList.remove('error', 'success');
  if (!text) return;
  formMessage.classList.add(type);
};

const fetchAccountDetails = async (accountId) => {
  const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/${accountId}/`, {
    method: 'GET',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.detail || 'Unable to load account details.');
  }
  return result;
};

const populateFormForEdit = (account) => {
  if (!account) return;
  editingAccountId = account.id;
  originalProvider = account.provider;
  providerSelect.value = account.provider;
  nameInput.value = account.account_name || '';
  showCredentialSection(account.provider);
  setMessage('Loaded existing account. Leave credential fields blank to keep current credentials.', 'success');
};

const showCredentialSection = (provider) => {
  credentialSections.forEach((section) => {

    const isActive = section.dataset.providerSection === provider;

    // show / hide section
    section.hidden = !isActive;

    const inputs = section.querySelectorAll("input, textarea");

    inputs.forEach((input) => {
      if (isActive) {
        if (section.dataset.providerSection === 'GCP') {
          // For GCP, either file upload or pasted JSON is acceptable.
          input.required = false;
        } else {
          input.required = true;     // validate visible provider
        }
        input.disabled = false;
      } else {
        input.required = false;    // remove validation
        input.disabled = true;     // prevent form submission
      }
    });

  });
};

const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const handleFormSubmit = async (event) => {
  event.preventDefault();
  setMessage("");

  const provider = providerSelect?.value || 'AWS';
  const accountName = nameInput?.value.trim();
  if (!accountName) {
    setMessage('Account name is required.');
    return;
  }

  let credentials = null;
  let hasCredentialInput = false;

  if (provider === 'AWS') {
    const accessKey = accessInput?.value.trim();
    const secretKey = secretInput?.value.trim();
    const sessionToken = sessionInput?.value.trim();

    if (!accessKey || !secretKey) {
      if (!editingAccountId) {
        setMessage('AWS access key and secret key are required.');
        return;
      }
    } else {
      credentials = { access_key: accessKey, secret_key: secretKey };
      if (sessionToken) credentials.session_token = sessionToken;
      hasCredentialInput = true;
    }
  } else if (provider === 'AZURE') {
    const tenantId = tenantInput?.value.trim();
    const clientId = clientInput?.value.trim();
    const clientSecret = clientSecretInput?.value.trim();
    const subscriptionId = subscriptionInput?.value.trim();

    if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
      if (!editingAccountId) {
        setMessage('All Azure service principal fields are required.');
        return;
      }
    } else {
      credentials = {
        tenant_id: tenantId,
        client_id: clientId,
        client_secret: clientSecret,
        subscription_id: subscriptionId,
      };
      hasCredentialInput = true;
    }
  } else if (provider === 'GCP') {
    const pastedJson = gcpJsonInput?.value.trim();
    let jsonText = pastedJson;

    if (gcpFileInput?.files?.length) {
      try {
        const fileContent = await readFileAsText(gcpFileInput.files[0]);
        jsonText = fileContent.trim();
      } catch (fileError) {
        setMessage('Unable to read the uploaded file.');
        return;
      }
    }

    if (jsonText) {
      try {
        credentials = JSON.parse(jsonText);
        hasCredentialInput = true;
      } catch (jsonError) {
        setMessage('GCP service account JSON must be valid.');
        return;
      }
    }

    if (!jsonText && !editingAccountId) {
      setMessage('Service account JSON is required for GCP.');
      return;
    }
  }

  if (editingAccountId && provider !== originalProvider && !hasCredentialInput) {
    setMessage('Changing provider requires providing new credentials.');
    return;
  }

  const payload = { provider, account_name: accountName };
  if (credentials) payload.credentials = credentials;

  try {
    showLoader();

    const url = editingAccountId
      ? `${BASE_URL}/api/accounts/cloud-accounts/${editingAccountId}/`
      : `${BASE_URL}/api/accounts/cloud-accounts/`;
    const method = editingAccountId ? 'PATCH' : 'POST';

    const response = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.detail || 'Unable to save account.');
    }

    const successMessage = editingAccountId
      ? 'Account updated successfully!'
      : 'Account verified and saved successfully!';
    setMessage(successMessage, 'success');
    setTimeout(() => {
      window.location.href = 'cloud_accounts.html';
    }, 900);
  } catch (error) {
    setMessage(error?.message || 'Connection failed. Check credentials.');
  } finally {
    hideLoader();
  }
};

const initDomRefs = () => {
  accountForm = document.getElementById('account-form');
  formMessage = document.getElementById('form-message');
  providerSelect = document.getElementById('provider-select');
  nameInput = document.getElementById('account-name');
  accessInput = document.getElementById('access-key');
  secretInput = document.getElementById('secret-key');
  sessionInput = document.getElementById('session-token');
  tenantInput = document.getElementById('tenant-id');
  clientInput = document.getElementById('client-id');
  clientSecretInput = document.getElementById('client-secret');
  subscriptionInput = document.getElementById('subscription-id');
  gcpFileInput = document.getElementById('gcp-file');
  gcpJsonInput = document.getElementById('gcp-json');

  credentialSections = document.querySelectorAll('[data-provider-section]');
};
const init = async () => {
  initDomRefs();
  requireAuth();

  const accountId = getQueryParam('cloud_account_id');
  if (accountId) {
    try {
      const account = await fetchAccountDetails(accountId);
      populateFormForEdit(account);
    } catch (error) {
      setMessage(error?.message || 'Failed to load account details.');
    }
  }

  showCredentialSection(providerSelect?.value || 'AWS');
  providerSelect?.addEventListener('change', (event) => showCredentialSection(event.target.value));
  accountForm?.addEventListener('submit', handleFormSubmit);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
