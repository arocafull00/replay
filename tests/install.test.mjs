import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const cacheRoot = resolve('node_modules/.cache');
await mkdir(cacheRoot, { recursive: true });
const build = await mkdtemp(join(cacheRoot, 'replay-install-'));
after(async () => {
  assert.ok(resolve(build).startsWith(`${cacheRoot}${sep}`));
  await rm(build, { recursive: true, force: true });
});
await writeFile(join(build, 'package.json'), '{"type":"module"}');
const source = await readFile('src/components/install-app.tsx', 'utf8');
await writeFile(join(build, 'install.js'), ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
} }).outputText);

let state, cursor, opened;
const dialog = { showModal() { opened += 1; }, close() {} };
const { default: reactDefault, ...reactExports } = await import('react');
mock.module('react', { defaultExport: reactDefault, namedExports: {
  ...reactExports,
  useId: () => 'install-test',
  useRef: () => ({ current: dialog }),
  useState(initial) {
    const index = cursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], value => { state[index] = value; }];
  },
} });
const { InstallApp } = await import(pathToFileURL(join(build, 'install.js')).href);
function render(pwa) { cursor = 0; return InstallApp({ pwa }); }
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function find(tree, type) { return nodes(tree).find(node => node.type === type); }
function device(userAgent, platform = '', maxTouchPoints = 0) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent, platform, maxTouchPoints } });
}
beforeEach(() => { state = []; opened = 0; device('Chrome/140.0 Windows'); });
const manual = { canInstall: false, installed: false, installApp: async () => false };

test('the install button remains visible without a browser prompt and opens a guide', async () => {
  const tree = render(manual);
  assert.equal(find(tree, 'button').props.disabled, false);
  await find(tree, 'button').props.onClick();
  assert.equal(opened, 1);
  assert.equal(find(render(manual), 'select').props.value, 'chrome');
});

test('an available native prompt opens directly without the tutorial', async () => {
  let prompts = 0;
  const tree = render({ ...manual, canInstall: true, installApp: async () => { prompts++; } });
  await find(tree, 'button').props.onClick();
  assert.equal(prompts, 1);
  assert.equal(opened, 0);
});

test('native installation errors fall back to the tutorial', async () => {
  await find(render({ ...manual, canInstall: true, installApp: async () => { throw new Error('Prompt failed'); } }), 'button').props.onClick();
  assert.equal(opened, 1);
  assert.equal(state[2], true);
});

test('a prompt received since the last render takes priority over the tutorial', async () => {
  let prompts = 0;
  await find(render({ ...manual, installApp: async () => { prompts++; return true; } }), 'button').props.onClick();
  assert.equal(prompts, 1);
  assert.equal(opened, 0);
});

test('iPhone and desktop-mode iPad get the Safari home screen steps', async () => {
  for (const args of [['iPhone Safari/605'], ['Macintosh Safari/605', 'MacIntel', 5]]) {
    state = [];
    device(...args);
    await find(render(manual), 'button').props.onClick();
    const tree = render(manual);
    assert.equal(find(tree, 'select').props.value, 'ios');
    assert.match(JSON.stringify(find(tree, 'ol')), /Añadir a pantalla de inicio/);
  }
});

test('Android, Firefox Android, Edge, Safari and other browsers get matching guides', async () => {
  for (const [ua, expected] of [['Android Chrome/140', 'android'], ['Android Firefox/144', 'firefox'], ['Chrome/140 Edg/140', 'edge'], ['Macintosh Safari/605', 'safari'], ['Firefox/144', 'other']]) {
    state = [];
    device(ua);
    await find(render(manual), 'button').props.onClick();
    assert.equal(find(render(manual), 'select').props.value, expected);
  }
});

test('users can choose a different browser when detection does not match', async () => {
  find(render(manual), 'select').props.onChange({ target: { value: 'ios' } });
  assert.equal(find(render(manual), 'select').props.value, 'ios');
});

test('the installed state is visible and disables the install action', () => {
  const button = find(render({ ...manual, installed: true }), 'button');
  assert.equal(button.props.disabled, true);
  assert.match(JSON.stringify(button.props.children), /Aplicación instalada/);
});
