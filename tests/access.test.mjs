import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Run the real session and route guards with controlled Clerk state and effects.
const cacheRoot = resolve('node_modules/.cache');
await mkdir(cacheRoot, { recursive: true });
const build = await mkdtemp(join(cacheRoot, 'replay-access-'));
after(async () => {
  assert.ok(resolve(build).startsWith(`${cacheRoot}${sep}`));
  await rm(build, { recursive: true, force: true });
});
await writeFile(join(build, 'package.json'), '{"type":"module"}');
for (const [source, target] of [
  ['src/lib/auth-cache.ts', 'auth-cache.js'],
  ['src/lib/auth.ts', 'auth.js'],
  ['src/components/access-gate.tsx', 'access-gate.js'],
]) {
  const input = (await readFile(source, 'utf8')).replaceAll('@/lib/', './').replaceAll('@/components/', './').replace("'next/navigation'", "'next/navigation.js'").replace(/from '(\.\/[^']+)'/g, "from '$1.js'");
  await writeFile(join(build, target), ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText);
}
await writeFile(join(build, 'api.js'), 'export class ApiError extends Error {}\nexport function useApi() {}');
await writeFile(join(build, 'login.js'), 'export function Login() {}');
const url = file => pathToFileURL(join(build, file)).href;
let auth, user, effects, redirects, verify, signedOut;
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.window = Object.assign(new EventTarget(), { setInterval: () => 1 });
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible', documentElement: { dataset: {} } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
const { default: reactDefault, ...reactExports } = await import('react');
mock.module('react', { defaultExport: reactDefault, namedExports: {
  ...reactExports,
  useCallback: callback => callback,
  useEffect: callback => { effects.push(callback); },
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
} });
mock.module('@clerk/react', { namedExports: {
  useAuth: () => auth,
  useUser: () => ({ user }),
  useClerk: () => ({ signOut: async () => { signedOut = true; } }),
} });
mock.module('next/navigation.js', { namedExports: { useRouter: () => ({ replace: path => redirects.push(path) }) } });
class ApiError extends Error { constructor(status) { super('Session error'); this.status = status; } }
mock.module(url('api.js'), { namedExports: { ApiError, useApi: () => verify } });
const { useAppSession } = await import(url('auth.js'));
const { AccessGate } = await import(url('access-gate.js'));
const { Login } = await import(url('login.js'));
const { saveSession, readSession, SESSION_HINT_KEY, ADMIN_CACHE_KEY, USAGE_KEY } = await import(url('auth-cache.js'));
beforeEach(() => {
  storage.clear(); effects = []; redirects = []; signedOut = false;
  auth = { isLoaded: true, isSignedIn: false, userId: null };
  user = null;
  verify = async () => ({ userId: 'coach', role: 'coach', name: 'Coach' });
});
function account(role) {
  auth = { isLoaded: true, isSignedIn: true, userId: role };
  user = { id: role, publicMetadata: { role } };
}
function render(role) {
  const element = AccessGate({ role, children: 'protected content' });
  effects.at(-1)();
  return element;
}

test('both entry routes show the same login when signed out', () => {
  for (const role of ['admin', 'coach']) assert.equal(render(role).type, Login);
  assert.deepEqual(redirects, []);
});
test('fresh logins send administrators to the panel and coaches to the app', () => {
  account('admin');
  assert.equal(render('coach').props.children.props.children, 'Entrando…');
  assert.deepEqual(redirects, ['/admin']);
  redirects = [];
  account('coach');
  assert.equal(render('admin').props.children.props.children, 'Entrando…');
  assert.deepEqual(redirects, ['/']);
});
test('each role sees its own content without a redirect', () => {
  for (const role of ['admin', 'coach']) {
    account(role);
    assert.equal(render(role).props.children, 'protected content');
  }
  assert.deepEqual(redirects, []);
});
test('cached sessions restore the correct destination before Clerk loads', () => {
  auth = { isLoaded: false };
  saveSession({ userId: 'admin', role: 'admin', name: 'Admin' });
  assert.equal(render('admin').props.children, 'protected content');
  render('coach');
  assert.deepEqual(redirects, ['/admin']);
});
test('switching accounts never inherits the previous account role', () => {
  saveSession({ userId: 'admin', role: 'admin', name: 'Admin' });
  account('coach');
  assert.equal(useAppSession().role, 'coach');
  assert.equal(render('coach').props.children, 'protected content');
  assert.deepEqual(redirects, []);
});
test('a fresh authenticated session waits for its role before mounting either screen', () => {
  auth = { isLoaded: true, isSignedIn: true, userId: 'new-account' };
  assert.equal(render('coach').props['aria-busy'], 'true');
  assert.deepEqual(redirects, []);
});
test('background session verification refreshes the role used for navigation', async () => {
  account('coach');
  saveSession({ userId: 'coach', role: 'admin', name: 'Old role' });
  useAppSession();
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readSession().role, 'coach');
  assert.equal(render('coach').props.children, 'protected content');
  cleanup();
});
test('a rejected session signs out and clears persisted account data', async () => {
  account('admin');
  saveSession({ userId: 'admin', role: 'admin', name: 'Admin' });
  storage.set(ADMIN_CACHE_KEY, '{}'); storage.set(USAGE_KEY, '[]');
  verify = async () => { throw new ApiError(401); };
  useAppSession();
  const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signedOut, true);
  assert.equal(storage.size, 0);
  cleanup();
});
test('invalid cached roles cannot cause redirect loops', () => {
  storage.set(SESSION_HINT_KEY, JSON.stringify({ userId: 'bad', role: 'unknown' }));
  auth = { isLoaded: false };
  assert.equal(render('coach').type, Login);
  assert.deepEqual(redirects, []);
});
