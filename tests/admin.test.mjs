import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyToken as verifySignedToken } from '@clerk/backend';
import ts from 'typescript';

// Exercise the deployed handlers without touching Clerk accounts or production analytics.
await mkdir('node_modules/.cache', { recursive: true });
const build = await mkdtemp(join(process.cwd(), 'node_modules/.cache/replay-tests-'));
after(() => rm(build, { recursive: true, force: true }));
async function compile(directory) {
  await mkdir(join(build, directory), { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compile(path);
    else if (entry.name.endsWith('.ts')) {
      const source = await readFile(path, 'utf8');
      const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      await writeFile(join(build, path.replace(/\.ts$/, '.js')), output);
    }
  }
}
await writeFile(join(build, 'package.json'), '{"type":"module"}');
await compile('api');
process.env.CLERK_SECRET_KEY = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' });
function sessionToken(origin) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'admin', sid: 'session-1', iss: 'https://test.clerk.accounts.dev', azp: origin, iat: now, nbf: now - 5, exp: now + 60 })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
}
let state;
const user = (id, role = 'coach') => ({ id, publicMetadata: { role }, firstName: id, lastName: '', username: id, emailAddresses: [], primaryEmailAddress: null, banned: false, locked: false, createdAt: 0, lastSignInAt: null });
const sqlCalls = [];
const clerk = {
  users: {
    getUser: async id => {
      if (id === 'missing') throw { clerkError: true, status: 404 };
      return state.users.get(id) ?? user(id);
    },
    getUserList: async ({ offset = 0, limit }) => ({ data: state.list.slice(offset, offset + limit), totalCount: state.list.length }),
    createUser: async params => { state.created = params; return { id: 'new-coach' }; },
    updateUser: async (...args) => { state.updated = args; },
    banUser: async id => { state.banned = id; },
    unbanUser: async id => { state.unbanned = id; },
    deleteUser: async id => { state.deleted = id; },
  },
  emailAddresses: {
    createEmailAddress: async params => { state.emailCreated = params; return { id: 'email-new' }; },
    deleteEmailAddress: async id => { (state.emailsDeleted ??= []).push(id); },
  },
  sessions: { getSession: async () => ({ status: state.sessionStatus, userId: state.userId }) },
};
mock.module('@clerk/backend', { namedExports: {
  createClerkClient: () => clerk,
  verifyToken: async (token, options) => {
    state.verifyOptions = options;
    if (token === 'invalid') throw new Error('Invalid token');
    if (token.includes('.')) return verifySignedToken(token, { ...options, jwtKey });
    return { sub: state.userId, sid: 'session-1' };
  },
} });
mock.module('@clerk/backend/errors', { namedExports: { isClerkAPIResponseError: error => error?.clerkError === true } });
mock.module('@neondatabase/serverless', { namedExports: { neon: () => async (strings, ...values) => {
  sqlCalls.push({ query: strings.join('?'), values });
  return [];
} } });
const load = path => import(pathToFileURL(join(build, path)).href);
const users = await load('api/admin/users.js');
const events = await load('api/events.js');
const session = await load('api/session.js');
const stats = await load('api/admin/stats.js');
beforeEach(() => {
  state = { userId: 'admin', sessionStatus: 'active', users: new Map([['admin', user('admin', 'admin')], ['coach', user('coach')]]), list: [] };
  sqlCalls.length = 0;
});
function request(path, { method = 'GET', body, token = 'valid' } = {}) {
  return new Request(`https://replayapp.vercel.app${path}`, { method, headers: { ...(token && { authorization: `Bearer ${token}` }), 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) });
}

test('all private endpoints reject anonymous and invalid tokens without reading data', async () => {
  for (const token of ['', 'invalid']) {
    for (const [handler, path, method] of [[users.GET, '/api/admin/users', 'GET'], [users.POST, '/api/admin/users', 'POST'], [users.PATCH, '/api/admin/users', 'PATCH'], [users.DELETE, '/api/admin/users', 'DELETE'], [stats.GET, '/api/admin/stats', 'GET'], [events.POST, '/api/events', 'POST'], [session.GET, '/api/session', 'GET']]) {
      const response = await handler(request(path, { token, method }));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  assert.equal(sqlCalls.length, 0);
});
test('coaches cannot list analytics or manage users, including forged admin metadata', async () => {
  state.userId = 'coach';
  for (const [handler, method] of [[users.GET, 'GET'], [users.POST, 'POST'], [users.PATCH, 'PATCH'], [users.DELETE, 'DELETE'], [stats.GET, 'GET']]) {
    assert.equal((await handler(request('/api/admin/users', { method, body: method === 'POST' || method === 'PATCH' ? { role: 'admin' } : undefined }))).status, 403);
  }
  assert.equal(sqlCalls.length, 0);
});
test('revoked sessions, banned users and deleted accounts lose access immediately', async () => {
  state.sessionStatus = 'revoked';
  assert.equal((await session.GET(request('/api/session'))).status, 401);
  state.sessionStatus = 'active';
  state.users.get('admin').banned = true;
  assert.equal((await session.GET(request('/api/session'))).status, 401);
  state.userId = 'missing';
  assert.equal((await session.GET(request('/api/session'))).status, 401);
});
test('session reports the server role and verifies the allowed frontend origin', async () => {
  const response = await session.GET(request('/api/session'));
  assert.deepEqual(await response.json(), { userId: 'admin', role: 'admin', name: 'admin' });
  assert.ok(state.verifyOptions.authorizedParties.includes('https://replayapp.vercel.app'));
});

test('production accepts signed sessions from the current and installed legacy app, but rejects other origins', async () => {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  try {
    for (const origin of ['https://replayapp.vercel.app', 'https://voley-delay.vercel.app']) {
      const response = await session.GET(request('/api/session', { token: sessionToken(origin) }));
      assert.equal(response.status, 200, origin);
      assert.equal((await response.json()).userId, 'admin');
    }
    for (const origin of ['https://untrusted.example', 'https://voley-delay.vercel.app.attacker.example', 'http://localhost:3000']) {
      assert.equal((await session.GET(request('/api/session', { token: sessionToken(origin) }))).status, 401, origin);
    }
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
test('the user list includes pages beyond 500 users and excludes administrators', async () => {
  state.list = [user('admin', 'admin'), ...Array.from({ length: 505 }, (_, i) => user(`coach-${i}`))];
  const response = await users.GET(request('/api/admin/users'));
  const data = await response.json();
  assert.equal(data.users.length, 505);
  assert.equal(data.users.at(-1).id, 'coach-504');
});
test('creation validates credentials and always creates a coach', async () => {
  for (const body of [null, { name: '', username: 'coach', password: 'password123' }, { name: 'Coach', username: '12345', password: 'password123' }, { name: 'Coach', username: 'coach', password: 'short' }]) {
    assert.equal((await users.POST(request('/api/admin/users', { method: 'POST', body }))).status, 400);
    assert.equal(state.created, undefined);
  }
  const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name: ' Ana ', username: ' ANA_COACH ', password: 'strong-password123', publicMetadata: { role: 'admin' } } }));
  assert.equal(response.status, 201);
  assert.equal(state.created.firstName, 'Ana');
  assert.equal(state.created.username, 'ana_coach');
  assert.deepEqual(state.created.publicMetadata, { role: 'coach' });
});

test('name-only creation generates reusable credentials and returns them only to the administrator', async () => {
  const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name: ' Ána García ', publicMetadata: { role: 'admin' } } }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const access = await response.json();
  assert.equal(access.username, 'ana_garcia');
  assert.equal(access.password, state.created.password);
  assert.ok(access.password.length >= 16);
  assert.deepEqual(state.created.publicMetadata, { role: 'coach' });
  assert.equal(state.created.firstName, 'Ána García');
  assert.equal(state.created.skipPasswordRequirement, undefined);
  const previousPassword = access.password;
  await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana García' } }));
  assert.notEqual(state.created.password, previousPassword);

  state.list = [{ ...user('new-coach'), password: access.password }];
  const listed = await (await users.GET(request('/api/admin/users'))).json();
  assert.equal(JSON.stringify(listed).includes(access.password), false);
});

test('automatic usernames support short, accented, long and non-Latin names', async () => {
  for (const name of ['Ana', 'Á', '李明', '12345', 'Á'.repeat(80)]) {
    const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name } }));
    assert.equal(response.status, 201);
    const { username } = await response.json();
    assert.match(username, /^[a-z0-9_-]{4,64}$/);
    assert.match(username, /[a-z]/);
  }
});

test('repeated names get a different username without overwriting an existing account', async context => {
  const attempts = [];
  context.mock.method(clerk.users, 'createUser', async params => {
    attempts.push(params);
    if (attempts.length === 1) throw { clerkError: true, errors: [{ code: 'form_identifier_exists' }] };
    return { id: 'new-coach' };
  });
  const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana García' } }));
  assert.equal(response.status, 201);
  const access = await response.json();
  assert.equal(attempts.length, 2);
  assert.notEqual(access.username, attempts[0].username);
  assert.equal(access.username, attempts[1].username);
  assert.equal(access.password, attempts[1].password);
  assert.equal(state.updated, undefined);
});

test('creation retries are bounded and never hide other Clerk validation failures', async context => {
  let calls = 0;
  let code = 'form_password_pwned';
  context.mock.method(clerk.users, 'createUser', async () => { calls += 1; throw { clerkError: true, errors: [{ code }] }; });
  const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana García' } }));
  assert.equal(response.status, 422);
  assert.equal(calls, 1);
  code = 'form_identifier_exists';
  calls = 0;
  assert.equal((await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana García' } }))).status, 422);
  assert.ok(calls <= 4);
  calls = 0;
  assert.equal((await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana', username: 'ana_coach' } }))).status, 422);
  assert.equal(calls, 1);
});
test('administrators cannot be edited, banned or deleted through the coach API', async () => {
  assert.equal((await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'admin', banned: true } }))).status, 403);
  assert.equal((await users.DELETE(request('/api/admin/users?id=admin', { method: 'DELETE' }))).status, 403);
  assert.equal(state.banned, undefined);
  assert.equal(state.deleted, undefined);
});
test('password changes revoke other sessions and coach activation is manageable', async () => {
  assert.equal((await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', password: 'replacement-password', banned: true } }))).status, 200);
  assert.equal(state.updated[1].signOutOfOtherSessions, true);
  assert.equal(state.banned, 'coach');
  state.users.get('coach').banned = true;
  await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', banned: false } }));
  assert.equal(state.unbanned, 'coach');
});
test('coaches can change their login username without changing their name or password', async () => {
  const response = await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', username: ' ANA_COACH ' } }));
  assert.equal(response.status, 200);
  assert.deepEqual(state.updated, ['coach', { username: 'ana_coach' }]);
});

test('editing rejects invalid usernames before changing the account', async () => {
  for (const username of ['', 'abc', 'a'.repeat(65), '12345', 'ana coach', 'ana@coach', null, 1234]) {
    const response = await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', username, name: 'Ana' } }));
    assert.equal(response.status, 400);
    assert.equal(state.updated, undefined);
  }
});

test('editing an existing username returns a useful error', async context => {
  context.mock.method(clerk.users, 'updateUser', async () => { throw { clerkError: true, errors: [{ code: 'form_identifier_exists' }] }; });
  const response = await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', username: 'taken_coach' } }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'Ese usuario ya existe.' });
});

test('creation stores an optional email and rejects malformed ones', async () => {
  assert.equal((await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana', email: 'not-an-email' } }))).status, 400);
  assert.equal(state.created, undefined);
  await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana', email: ' Ana@Example.COM ' } }));
  assert.deepEqual(state.created.emailAddress, ['ana@example.com']);
  await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana', email: '' } }));
  assert.equal(state.created.emailAddress, undefined);
});

test('a taken email is reported without retrying with another username', async context => {
  let calls = 0;
  context.mock.method(clerk.users, 'createUser', async () => { calls += 1; throw { clerkError: true, errors: [{ code: 'form_identifier_exists', meta: { paramName: 'email_address' } }] }; });
  const response = await users.POST(request('/api/admin/users', { method: 'POST', body: { name: 'Ana', email: 'ana@example.com' } }));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'Ese correo ya lo usa otra cuenta.' });
  assert.equal(calls, 1);
});

test('editing replaces or removes the email and leaves it alone when unchanged', async () => {
  const coach = state.users.get('coach');
  coach.emailAddresses = [{ id: 'email-old', emailAddress: 'old@example.com' }];
  coach.primaryEmailAddress = coach.emailAddresses[0];
  await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', email: 'OLD@example.com' } }));
  assert.equal(state.emailCreated, undefined);
  assert.equal(state.emailsDeleted, undefined);
  await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', email: 'new@example.com' } }));
  assert.deepEqual(state.emailCreated, { userId: 'coach', emailAddress: 'new@example.com', verified: true, primary: true });
  assert.deepEqual(state.emailsDeleted, ['email-old']);
  state.emailCreated = undefined;
  state.emailsDeleted = undefined;
  await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', email: '' } }));
  assert.equal(state.emailCreated, undefined);
  assert.deepEqual(state.emailsDeleted, ['email-old']);
  assert.equal((await users.PATCH(request('/api/admin/users', { method: 'PATCH', body: { id: 'coach', email: 'bad@' } }))).status, 400);
});

test('events use the authenticated account and stable ids for idempotent retries', async () => {
  state.userId = 'coach';
  const id = '37bf6ea1-b237-4cac-8821-67b1072200ea';
  const response = await events.POST(request('/api/events', { method: 'POST', body: { userId: 'other-user', events: [{ id, type: 'clip', at: Date.now(), userId: 'other-user' }] } }));
  assert.equal(response.status, 200);
  assert.equal(sqlCalls[0].values[0], 'coach');
  assert.deepEqual(sqlCalls[0].values[1], [id]);
  assert.match(sqlCalls[0].query, /on conflict \(user_id, event_id\) do nothing/);
});
test('malformed analytics and oversized batches are rejected before database writes', async () => {
  for (const batch of [[null], [{ id: 'bad', type: 'clip', at: Date.now() }], [{ id: '37bf6ea1-b237-4cac-8821-67b1072200ea', type: 'unknown', at: Date.now() }], Array(51).fill({})]) {
    assert.equal((await events.POST(request('/api/events', { method: 'POST', body: { events: batch } }))).status, 400);
  }
  assert.equal(sqlCalls.length, 0);
});
