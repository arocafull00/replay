export type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

declare global {
  interface Window {
    __replayInstallPrompt?: InstallEvent | null;
    __replayAppInstalled?: boolean;
  }
}

// Runs in the document head, before authentication or React can delay the panel.
export const PWA_INSTALL_SCRIPT = `window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();window.__replayInstallPrompt=event;window.dispatchEvent(new Event('replay:installchange'))});window.addEventListener('appinstalled',function(){window.__replayInstallPrompt=null;window.__replayAppInstalled=true;window.dispatchEvent(new Event('replay:installchange'))});`;

export function getInstallPrompt() { return window.__replayInstallPrompt ?? null; }
export function subscribeInstallPrompt(callback: () => void) {
  window.addEventListener('replay:installchange', callback);
  return () => window.removeEventListener('replay:installchange', callback);
}
export function clearInstallPrompt(event: InstallEvent) {
  if (window.__replayInstallPrompt !== event) return;
  window.__replayInstallPrompt = null;
  window.dispatchEvent(new Event('replay:installchange'));
}
