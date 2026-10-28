import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@clerk/react';

const SESSION_HINT_KEY = 'replay:session:v1';

function readHint() { try { return localStorage.getItem(SESSION_HINT_KEY) !== null; } catch { return false; } }
function subscribe(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener('session-change', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('session-change', callback); }; }
function saveHint(signedIn: boolean) {
  if (readHint() === signedIn) return;
  try { if (signedIn) localStorage.setItem(SESSION_HINT_KEY, '1'); else localStorage.removeItem(SESSION_HINT_KEY); } catch {}
  if (signedIn) delete document.documentElement.dataset.auth;
  window.dispatchEvent(new Event('session-change'));
}
export function useSignedIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const hint = useSyncExternalStore(subscribe, readHint, () => true);
  useEffect(() => { if (isLoaded) saveHint(!!isSignedIn); }, [isLoaded, isSignedIn]);
  return isLoaded ? !!isSignedIn : hint;
}
