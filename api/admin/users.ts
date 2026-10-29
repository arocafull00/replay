import { randomBytes } from 'node:crypto';
import { isClerkAPIResponseError, type ClerkAPIResponseError } from '@clerk/backend/errors';
import { clerk, handle, HttpError, isAdmin, requireAdmin } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

const CLERK_ERRORS: Record<string, string> = {
  form_identifier_exists: 'Ese usuario ya existe.',
  form_username_invalid_length: 'El usuario debe tener entre 4 y 64 caracteres.',
  form_username_invalid_character_type: 'El usuario solo puede tener letras, números, guiones y guiones bajos.',
  form_username_needs_non_number_char: 'El usuario debe incluir alguna letra.',
  form_password_length_too_short: 'La contraseña debe tener al menos 8 caracteres.',
  form_password_pwned: 'Esa contraseña aparece en filtraciones conocidas. Elige otra.',
  form_password_not_strong_enough: 'La contraseña es demasiado débil.',
};

type Usage = { user_id: string; clips: number; sessions: number; last_used: string };

async function clerkCall<T>(run: () => Promise<T>) {
  try { return await run(); }
  catch (error) {
    if (isClerkAPIResponseError(error)) throw new HttpError(422, CLERK_ERRORS[(error as ClerkAPIResponseError).errors[0]?.code ?? ''] ?? 'No se ha podido guardar. Revisa los datos.');
    throw error;
  }
}

async function readBody(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Petición no válida.');
  return body as { id?: string; name?: string; username?: string; password?: string; banned?: boolean };
}

async function coach(id: unknown) {
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'Falta el entrenador.');
  const user = await clerkCall(() => clerk.users.getUser(id));
  if (isAdmin(user)) throw new HttpError(403, 'No se puede modificar al administrador desde aquí.');
  return user;
}

function name(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 80) throw new HttpError(400, 'Escribe un nombre de hasta 80 caracteres.');
  return text;
}

function password(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 1024) throw new HttpError(400, 'La contraseña debe tener entre 8 y 1024 caracteres.');
  return value;
}

function validateUsername(value: unknown) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-z0-9_-]{4,64}$/.test(text) || !/[a-z]/.test(text)) throw new HttpError(400, 'El usuario debe tener entre 4 y 64 caracteres e incluir alguna letra.');
  return text;
}

function usernameFromName(firstName: string) {
  const base = firstName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48);
  return base.length >= 4 && /[a-z]/.test(base) ? base : `coach_${base}`;
}

async function allUsers() {
  const users = [];
  for (let offset = 0; ; offset += 500) {
    const { data, totalCount } = await clerk.users.getUserList({ limit: 500, offset, orderBy: '+created_at' });
    users.push(...data);
    if (!data.length || users.length >= totalCount) return users;
  }
}

export const GET = handle(async request => {
  await requireAdmin(request);
  const [data, usage] = await Promise.all([
    allUsers(),
    sql`select user_id, count(*) filter (where type = 'clip')::int as clips, count(*) filter (where type = 'session')::int as sessions, max(created_at) as last_used from events group by user_id`,
  ]);
  const byUser = new Map((usage as Usage[]).map(row => [row.user_id, row]));
  const users = data.filter(user => !isAdmin(user)).map(user => {
    const row = byUser.get(user.id);
    return { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' '), username: user.username ?? '', createdAt: user.createdAt, lastSignInAt: user.lastSignInAt, lastUsedAt: row ? Date.parse(row.last_used) : null, banned: user.banned, clips: row?.clips ?? 0, sessions: row?.sessions ?? 0 };
  });
  return Response.json({ users });
});

export const POST = handle(async request => {
  await requireAdmin(request);
  const body = await readBody(request);
  const firstName = name(body.name);
  const automaticUsername = body.username === undefined;
  const base = automaticUsername ? usernameFromName(firstName) : validateUsername(body.username);
  const initialPassword = body.password === undefined ? `${randomBytes(12).toString('base64url')}aA7!` : password(body.password);
  let username = base;
  const user = await clerkCall(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try { return await clerk.users.createUser({ firstName, username, password: initialPassword, publicMetadata: { role: 'coach' } }); }
      catch (error) {
        if (!automaticUsername || attempt >= 3 || !isClerkAPIResponseError(error) || error.errors[0]?.code !== 'form_identifier_exists') throw error;
        username = `${base}_${randomBytes(3).toString('hex')}`;
      }
    }
  });
  // Returned only to the administrator, never included in the persisted user list.
  return Response.json({ id: user.id, username, password: initialPassword }, { status: 201 });
});

export const PATCH = handle(async request => {
  await requireAdmin(request);
  const body = await readBody(request);
  if (body.banned !== undefined && typeof body.banned !== 'boolean') throw new HttpError(400, 'Estado no válido.');
  const firstName = body.name === undefined ? undefined : name(body.name);
  const username = body.username === undefined ? undefined : validateUsername(body.username);
  const nextPassword = body.password === undefined ? undefined : password(body.password);
  const user = await coach(body.id);
  if (firstName !== undefined || username !== undefined || nextPassword !== undefined) await clerkCall(() => clerk.users.updateUser(user.id, { ...(firstName !== undefined && { firstName, lastName: '' }), ...(username !== undefined && { username }), ...(nextPassword !== undefined && { password: nextPassword, signOutOfOtherSessions: true }) }));
  if (body.banned === true && !user.banned) await clerkCall(() => clerk.users.banUser(user.id));
  if (body.banned === false && user.banned) await clerkCall(() => clerk.users.unbanUser(user.id));
  return Response.json({ ok: true });
});

export const DELETE = handle(async request => {
  await requireAdmin(request);
  const user = await coach(new URL(request.url).searchParams.get('id'));
  await clerk.users.deleteUser(user.id);
  return Response.json({ ok: true });
});
