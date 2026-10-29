export const SESSION_HINT_KEY = 'replay:session:v1';
export const ADMIN_CACHE_KEY = 'replay:admin:v1';
export const USAGE_KEY = 'replay:events:v1';
export type CachedSession = { userId: string; role: 'admin' | 'coach'; name: string };

export function readSession(): CachedSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_HINT_KEY) ?? 'null');
    return value && typeof value.userId === 'string' && (value.role === 'admin' || value.role === 'coach') ? value : null;
  } catch { return null; }
}
export function clearSession() {
  try { [SESSION_HINT_KEY, ADMIN_CACHE_KEY, USAGE_KEY].forEach(key => localStorage.removeItem(key)); } catch {}
  window.dispatchEvent(new Event('session-change'));
}
export function saveSession(session: CachedSession) {
  const previous = readSession();
  if (previous && previous.userId !== session.userId) clearSession();
  try { localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(session)); } catch {}
  delete document.documentElement.dataset.auth;
  window.dispatchEvent(new Event('session-change'));
}
