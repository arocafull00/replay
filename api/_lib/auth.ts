import { createClerkClient, verifyToken } from '@clerk/backend';
import { isClerkAPIResponseError, type ClerkAPIResponseError } from '@clerk/backend/errors';

const secretKey = process.env.CLERK_SECRET_KEY;
export const clerk = createClerkClient({ secretKey });

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function requireAccount(request: Request) {
  if (!secretKey) throw new HttpError(503, 'El acceso todavía no está configurado.');
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Inicia sesión de nuevo.');
  const authorizedParties = [
    process.env.NEXT_PUBLIC_SITE_URL || 'https://replayapp.vercel.app',
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.CLERK_AUTHORIZED_PARTIES?.split(',').map(origin => origin.trim()).filter(Boolean) ?? []),
    ...(process.env.VERCEL_ENV !== 'production' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
  ];
  let payload;
  try { payload = await verifyToken(token, { secretKey, authorizedParties }); }
  catch { throw new HttpError(401, 'Inicia sesión de nuevo.'); }
  if (!payload.sub || !payload.sid) throw new HttpError(401, 'Inicia sesión de nuevo.');
  try {
    // JWT verification alone does not detect sessions revoked since the token was issued.
    const [user, session] = await Promise.all([clerk.users.getUser(payload.sub), clerk.sessions.getSession(payload.sid)]);
    if (user.banned || user.locked || session.status !== 'active' || session.userId !== user.id) throw new HttpError(401, 'Inicia sesión de nuevo.');
    return user;
  } catch (error) {
    if (isClerkAPIResponseError(error) && (error as ClerkAPIResponseError).status === 404) throw new HttpError(401, 'Inicia sesión de nuevo.');
    throw error;
  }
}

export async function requireUser(request: Request) { return (await requireAccount(request)).id; }
export async function getSession(request: Request) {
  const user = await requireAccount(request);
  return { userId: user.id, role: isAdmin(user) ? 'admin' : 'coach', name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '' };
}

export function isAdmin(user: { publicMetadata: Record<string, unknown> }) { return user.publicMetadata.role === 'admin'; }

export async function requireAdmin(request: Request) {
  const user = await requireAccount(request);
  if (!isAdmin(user)) throw new HttpError(403, 'Esta cuenta no tiene acceso.');
  return user.id;
}

export function handle(run: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try { const response = await run(request); response.headers.set('Cache-Control', 'private, no-store'); return response; }
    catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
      console.error('API request failed', error instanceof Error ? error.name : 'UnknownError');
      return Response.json({ error: 'Algo ha fallado. Inténtalo de nuevo.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
    }
  };
}
