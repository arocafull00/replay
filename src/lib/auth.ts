import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { ApiError, useApi } from '@/lib/api';
import { clearSession, readSession, saveSession, type CachedSession } from '@/lib/auth-cache';

function readIdentity() { const session = readSession(); return session ? JSON.stringify(session) : null; }
function subscribe(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener('session-change', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('session-change', callback); }; }
export function useAppSignOut() {
  const { signOut } = useClerk();
  return useCallback(async () => { clearSession(); await signOut(); }, [signOut]);
}
export function useAppUserId() {
  const { isLoaded, userId } = useAuth();
  const identity = useSyncExternalStore(subscribe, readIdentity, () => null);
  return isLoaded ? userId : identity ? (JSON.parse(identity) as CachedSession).userId : null;
}
export function useAppSession() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const api = useApi();
  const signOut = useAppSignOut();
  const identity = useSyncExternalStore(subscribe, readIdentity, () => null);
  const cached: CachedSession | null = identity ? JSON.parse(identity) : null;
  // A previous account's role must never decide where a new account lands.
  const session = !isLoaded || cached?.userId === userId ? cached : null;
  const signedIn = isLoaded ? !!isSignedIn : !!session;
  const role = signedIn
    ? session?.role ?? (user && user.id === userId ? (user.publicMetadata.role === 'admin' ? 'admin' : 'coach') : null)
    : null;
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { clearSession(); return; }
    const previous = readSession();
    if (previous && previous.userId !== userId) clearSession();
    delete document.documentElement.dataset.auth;
    let current = true;
    const verify = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      void api<CachedSession>('/api/session').then(session => {
        if (current) saveSession(session);
      }, error => {
        if (current && error instanceof ApiError && error.status === 401) void signOut();
      });
    };
    verify();
    const timer = window.setInterval(verify, 60_000);
    window.addEventListener('online', verify);
    document.addEventListener('visibilitychange', verify);
    return () => { current = false; clearInterval(timer); window.removeEventListener('online', verify); document.removeEventListener('visibilitychange', verify); };
  }, [api, isLoaded, isSignedIn, userId, signOut]);
  return { signedIn, role, userId: isLoaded ? userId : session?.userId };
}
