'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { clearInstallPrompt, getInstallPrompt, subscribeInstallPrompt } from '@/lib/pwa-install';
export function usePwa(active: boolean) {
  const busy = useRef(active);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineError, setOfflineError] = useState(false);
  const install = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
  const [installed, setInstalled] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => { busy.current = active; if (!active) registration.current?.waiting?.postMessage({ type: 'ACTIVATE_WHEN_IDLE' }); }, [active]);
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)');
    const standalone = () => setInstalled(!!window.__replayAppInstalled || media.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    standalone();
    window.addEventListener('replay:installchange', standalone);
    media.addEventListener('change', standalone);
    let disposed = false;
    let checkTimer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const controller = navigator.serviceWorker.controller;
      if (!controller || disposed) return;
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); if (!disposed) setOfflineError(true); }, 10_000);
      channel.port1.onmessage = event => {
        clearTimeout(timeout); channel.port1.close();
        if (!disposed) { setOfflineReady(event.data?.ready === true); setOfflineError(event.data?.ready !== true); }
      };
      controller.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
    };
    const status = (event: MessageEvent) => { if (event.data?.type === 'SESSION_STATUS') event.ports[0]?.postMessage({ busy: busy.current }); };
    const online = () => { check(); if (!busy.current) void registration.current?.update().catch(() => {}); };
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.addEventListener('controllerchange', check);
      navigator.serviceWorker.addEventListener('message', status);
      window.addEventListener('online', online);
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async reg => {
        if (disposed) return;
        registration.current = reg;
        if (!busy.current) reg.waiting?.postMessage({ type: 'ACTIVATE_WHEN_IDLE' });
        reg.addEventListener('updatefound', () => {
          reg.installing?.addEventListener('statechange', () => {
            if (!busy.current && reg.waiting) reg.waiting.postMessage({ type: 'ACTIVATE_WHEN_IDLE' });
          });
        });
        await navigator.serviceWorker.ready;
        if (!disposed) { check(); checkTimer = setTimeout(check, 1500); }
      }).catch(() => { if (!disposed) setOfflineError(true); });
    }
    return () => {
      disposed = true; clearTimeout(checkTimer);
      window.removeEventListener('replay:installchange', standalone);
      media.removeEventListener('change', standalone); window.removeEventListener('online', online);
      navigator.serviceWorker?.removeEventListener('controllerchange', check); navigator.serviceWorker?.removeEventListener('message', status);
    };
  }, []);
  async function installApp() {
    // Read at click time too: Chrome may have emitted the event since the last render.
    const prompt = getInstallPrompt();
    if (!prompt) return false;
    try { await prompt.prompt(); await prompt.userChoice; return true; }
    finally { clearInstallPrompt(prompt); }
  }
  return { offlineReady, offlineError, canInstall: !!install, installed, installApp };
}
