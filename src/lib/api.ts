import { useCallback } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { clearSession } from '@/lib/auth-cache';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  return useCallback(async <T>(path: string, method = 'GET', body?: unknown) => {
    const token = await getToken();
    if (!token) throw new ApiError(401, 'Inicia sesión de nuevo.');
    let response: Response;
    try { response = await fetch(path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ApiError(0, 'Sin conexión. Inténtalo de nuevo.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) { clearSession(); void signOut(); }
      throw new ApiError(response.status, data.error ?? 'Algo ha fallado. Inténtalo de nuevo.');
    }
    return data as T;
  }, [getToken, signOut]);
}
