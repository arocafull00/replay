import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { clearSession, readSession, USAGE_KEY } from '@/lib/auth-cache';

type UsageEvent = { id: string; userId: string; type: 'open' | 'session' | 'clip'; at: number };
type GetToken = () => Promise<string | null>;

function read(): UsageEvent[] { try { const events = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '[]'); return Array.isArray(events) ? events.filter(event => event && typeof event.id === 'string' && typeof event.userId === 'string') : []; } catch { return []; } }
function write(events: UsageEvent[]) { try { if (events.length) localStorage.setItem(USAGE_KEY, JSON.stringify(events.slice(-500))); else localStorage.removeItem(USAGE_KEY); } catch {} }

let flushing = false;
async function flush(userId: string, getToken: GetToken) {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (let events = read().filter(event => event.userId === userId).slice(0, 50); events.length; events = read().filter(event => event.userId === userId).slice(0, 50)) {
      const token = await getToken();
      if (!token) return;
      const response = await fetch('/api/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ events }) });
      if (response.status === 401) { if (readSession()?.userId === userId) clearSession(); return; }
      if (!response.ok && response.status !== 400) return;
      const sent = new Set(events.map(event => event.id));
      write(read().filter(event => !sent.has(event.id)));
    }
  } catch {} finally { flushing = false; }
}

export function useUsage() {
  const { getToken, userId } = useAuth();
  const token = useRef({ userId, getToken });
  useEffect(() => { token.current = { userId, getToken }; }, [getToken, userId]);
  useEffect(() => {
    if (!userId) return;
    const retry = () => void flush(userId, () => token.current.userId === userId ? token.current.getToken() : Promise.resolve(null));
    retry();
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener('online', retry);
    return () => { clearInterval(timer); window.removeEventListener('online', retry); };
  }, [userId]);
  return useCallback((type: UsageEvent['type']) => {
    if (!userId) return;
    write([...read(), { id: crypto.randomUUID(), userId, type, at: Date.now() }]);
    void flush(userId, () => token.current.userId === userId ? token.current.getToken() : Promise.resolve(null));
  }, [userId]);
}
