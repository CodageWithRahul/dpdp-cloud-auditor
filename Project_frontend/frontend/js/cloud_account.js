import { BASE_URL, fetchWithAuth, requireAuth } from './api.js';

const cloudAccountForm = document.getElementById('cloud-account-form');
const cloudAccountMessage = document.getElementById('cloud-account-message');
const providerSelect = document.getElementById('account-provider');
const credentialSections = document.querySelectorAll('[data-provider-section]');
const loaderOverlay = document.getElementById('cloud-loader');

const setMessage = (element, text, type = 'error') => {
  if (!element) return;
  element.textContent = text;
  element.classList.remove('message--error', 'message--success');
  element.classList.add(type === 'success' ? 'message--success' : 'message--error');
};

const showCredentialSection = (provider) => {
  credentialSections.forEach((section) => {
    section.hidden = section.dataset.providerSection !== provider;
  });
};

providerSelect?.addEventListener('change', (event) => {
  showCredentialSection(event.target.value);
});
showCredentialSection(providerSelect?.value || 'AWS');

const setFormDisabled = (disabled) => {
  cloudAccountForm?.querySelectorAll('input, select, textarea, button').forEach((control) => {
    control.disabled = disabled;
  });
};

const toggleLoader = (visible) => {
  if (!loaderOverlay) return;
  loaderOverlay.classList.toggle('hidden', !visible);
  setFormDisabled(visible);
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

const handleCloudAccount = async (event) => {
  event.preventDefault();
  if (!cloudAccountForm) return;

  const provider = providerSelect?.value || 'AWS';
  const accountName = document.getElementById('account-name')?.value.trim();

  if (!accountName) {
    setMessage(cloudAccountMessage, 'Account name is required.');
    return;
  }

  let credentials = null;

  if (provider === 'AWS') {
    const accessKey = document.getElementById('aws-access-key')?.value.trim();
    const secretKey = document.getElementById('aws-secret-key')?.value.trim();
    const region = document.getElementById('aws-region')?.value.trim();
    const sessionToken = document.getElementById('aws-session-token')?.value.trim();

    if (!accessKey || !secretKey) {
      setMessage(cloudAccountMessage, 'AWS access key and secret key are required.');
      return;
    }

    credentials = {
      access_key: accessKey,
      secret_key: secretKey,
    };
    if (region) credentials.region = region;
    if (sessionToken) credentials.session_token = sessionToken;
  } else if (provider === 'AZURE') {
    const tenantId = document.getElementById('azure-tenant-id')?.value.trim();
    const clientId = document.getElementById('azure-client-id')?.value.trim();
    const clientSecret = document.getElementById('azure-client-secret')?.value.trim();
    const subscriptionId = document.getElementById('azure-subscription-id')?.value.trim();

    if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
      setMessage(cloudAccountMessage, 'All Azure service principal fields are required.');
      return;
    }

    credentials = {
      tenant_id: tenantId,
      client_id: clientId,
      client_secret: clientSecret,
      subscription_id: subscriptionId,
    };
  } else if (provider === 'GCP') {
    const fileInput = document.getElementById('gcp-service-account-file');
    const pastedJson = document.getElementById('gcp-service-account-json')?.value.trim();
    let jsonText = pastedJson;

    if (fileInput?.files?.length) {
      try {
        const fileContent = await readFileAsText(fileInput.files[0]);
        jsonText = fileContent.trim();
      } catch (fileError) {
        setMessage(cloudAccountMessage, 'Unable to read the uploaded file.');
        return;
      }
    }

    if (!jsonText) {
      setMessage(cloudAccountMessage, 'Service account JSON is required for GCP.');
      return;
    }

    try {
      credentials = JSON.parse(jsonText);
    } catch (jsonError) {
      setMessage(cloudAccountMessage, 'GCP service account JSON must be valid.');
      return;
    }
  }

  const payloadBody = {
    provider,
    account_name: accountName,
  };

  if (credentials) {
    payloadBody.credentials = credentials;
  }

  toggleLoader(true);
  try {
    const response = await fetchWithAuth(`${BASE_URL}/api/accounts/cloud-accounts/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloadBody),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'Unable to register cloud account.');
    }

    setMessage(cloudAccountMessage, 'Cloud account added! Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 800);
  } catch (error) {
    setMessage(cloudAccountMessage, error?.message || 'Could not add account.');
  } finally {
    toggleLoader(false);
  }
};

requireAuth();
cloudAccountForm?.addEventListener('submit', handleCloudAccount);
