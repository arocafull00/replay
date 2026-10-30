import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const cacheRoot = resolve('node_modules/.cache');
await mkdir(cacheRoot, { recursive: true });
const build = await mkdtemp(join(cacheRoot, 'replay-pwa-'));
after(async () => {
  assert.ok(resolve(build).startsWith(`${cacheRoot}${sep}`));
  await rm(build, { recursive: true, force: true });
});
await writeFile(join(build, 'package.json'), '{"type":"module"}');
for (const file of ['pwa-install', 'use-pwa']) {
  const source = (await readFile(`src/lib/${file}.ts`, 'utf8')).replace('@/lib/pwa-install', './pwa-install.js');
  await writeFile(join(build, `${file}.js`), ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText);
}
const { default: reactDefault, ...reactExports } = await import('react');
mock.module('react', { defaultExport: reactDefault, namedExports: {
  ...reactExports,
  useRef: value => ({ current: value }),
  useState: value => [value, () => {}],
  useEffect: () => {},
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
} });
const { PWA_INSTALL_SCRIPT, getInstallPrompt, subscribeInstallPrompt } = await import(pathToFileURL(join(build, 'pwa-install.js')).href);
const { usePwa } = await import(pathToFileURL(join(build, 'use-pwa.js')).href);
beforeEach(() => {
  globalThis.window = new EventTarget();
  runInNewContext(PWA_INSTALL_SCRIPT, { window, Event });
});
function browserPrompt(prompt = async () => {}) {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  window.dispatchEvent(event);
  return event;
}

test('a Chrome prompt emitted before the panel mounts is kept for its install button', async () => {
  let calls = 0;
  const event = browserPrompt(async () => { calls++; });
  assert.equal(event.defaultPrevented, true);
  const pwa = usePwa(false);
  assert.equal(pwa.canInstall, true);
  assert.equal(await pwa.installApp(), true);
  assert.equal(calls, 1);
  assert.equal(getInstallPrompt(), null);
});

test('the click reads a prompt arriving after the last React render', async () => {
  const pwa = usePwa(false);
  assert.equal(pwa.canInstall, false);
  let called = false;
  browserPrompt(async () => { called = true; });
  const installing = pwa.installApp();
  assert.equal(called, true, 'prompt must be called synchronously inside the click gesture');
  assert.equal(await installing, true);
});

test('authentication and route remounts do not discard the pending event', () => {
  const event = browserPrompt();
  assert.equal(usePwa(false).canInstall, true);
  assert.equal(usePwa(false).canInstall, true);
  assert.equal(getInstallPrompt(), event);
});

test('components are notified when Chrome makes installation available', () => {
  let updates = 0;
  const unsubscribe = subscribeInstallPrompt(() => updates++);
  browserPrompt();
  assert.equal(updates, 1);
  unsubscribe();
  browserPrompt();
  assert.equal(updates, 1);
});

test('a consumed or rejected browser event cannot be reused', async () => {
  browserPrompt(async () => { throw new Error('Browser rejected prompt'); });
  await assert.rejects(usePwa(false).installApp(), /Browser rejected/);
  assert.equal(getInstallPrompt(), null);
  assert.equal(await usePwa(false).installApp(), false);
});

test('installation clears the prompt even before React mounts', () => {
  browserPrompt();
  window.dispatchEvent(new Event('appinstalled'));
  assert.equal(getInstallPrompt(), null);
  assert.equal(window.__replayAppInstalled, true);
});
