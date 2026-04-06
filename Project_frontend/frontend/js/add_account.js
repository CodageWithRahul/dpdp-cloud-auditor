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

const setMessage = (text = '', type = 'error') => {
  if (!formMessage) return;
  formMessage.textContent = text;
  formMessage.classList.remove('error', 'success');
  if (!text) return;
  formMessage.classList.add(type);
};

const showCredentialSection = (provider) => {
  credentialSections.forEach((section) => {

    const isActive = section.dataset.providerSection === provider;

    // show / hide section
    section.hidden = !isActive;

    const inputs = section.querySelectorAll("input, textarea");

    inputs.forEach((input) => {

      if (isActive) {
        input.required = true;     // validate visible provider
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

  if (provider === 'AWS') {
    const accessKey = accessInput?.value.trim();
    const secretKey = secretInput?.value.trim();
    const sessionToken = sessionInput?.value.trim();

    if (!accessKey || !secretKey) {
      setMessage('AWS access key and secret key are required.');
      return;
    }

    credentials = { access_key: accessKey, secret_key: secretKey };
    if (sessionToken) credentials.session_token = sessionToken;
  } else if (provider === 'AZURE') {
    const tenantId = tenantInput?.value.trim();
    const clientId = clientInput?.value.trim();
    const clientSecret = clientSecretInput?.value.trim();
    const subscriptionId = subscriptionInput?.value.trim();

    if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
      setMessage('All Azure service principal fields are required.');
      return;
    }

    credentials = {
      tenant_id: tenantId,
      client_id: clientId,
      client_secret: clientSecret,
      subscription_id: subscriptionId,
    };
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

    if (!jsonText) {
      setMessage('Service account JSON is required for GCP.');
      return;
    }

    try {
      credentials = JSON.parse(jsonText);
    } catch (jsonError) {
      setMessage('GCP service account JSON must be valid.');
      return;
    }
  }

  const payload = { provider, account_name: accountName };
  if (credentials) payload.credentials = credentials;

  try {
    showLoader();
    console.log(payload);
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.detail || 'Unable to save account.');
    }
    setMessage('Account verified and saved successfully!', 'success');
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
const init = () => {
  initDomRefs();
  requireAuth();
  showCredentialSection(providerSelect?.value || 'AWS');
  providerSelect?.addEventListener('change', (event) => showCredentialSection(event.target.value));
  accountForm?.addEventListener('submit', handleFormSubmit);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
