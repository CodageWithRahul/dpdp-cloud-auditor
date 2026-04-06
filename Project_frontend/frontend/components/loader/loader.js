const loaderId = 'app-loader';
const loaderUrl = new URL('./loader.html', import.meta.url).href;

let loaderPromise;

const ensureLoader = async () => {
  if (document.getElementById(loaderId)) {
    return document.getElementById(loaderId);
  }
  if (loaderPromise) {
    return loaderPromise;
  }
  loaderPromise = (async () => {
    try {
      const response = await fetch(loaderUrl, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`Failed to load loader template: ${response.status}`);
      }
      const html = await response.text();
      document.body.insertAdjacentHTML('beforeend', html);
      return document.getElementById(loaderId);
    } catch (error) {
      console.warn('Unable to render loader:', error);
      return null;
    }
  })();
  return loaderPromise;
};

const toggleLoader = async (action) => {
  const loader = await ensureLoader();
  if (!loader) return;
  loader.classList[action]('hidden');
};

export const showLoader = () => {
  toggleLoader('remove');
};

export const hideLoader = () => {
  toggleLoader('add');
};

if (typeof window !== 'undefined') {
  window.showLoader = showLoader;
  window.hideLoader = hideLoader;
}
