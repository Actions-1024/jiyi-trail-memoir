let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  window.dispatchEvent(new CustomEvent('jiyi-install-available'));
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  window.dispatchEvent(new CustomEvent('jiyi-installed'));
});

export function isStandalone() {
  return !!window.JiyiAndroid
    || location.hostname === 'appassets.androidplatform.net'
    || window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.startsWith('android-app://');
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isSecure() {
  return window.isSecureContext;
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}
