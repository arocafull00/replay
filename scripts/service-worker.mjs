import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
const files = (await walk('out')).filter(file => !file.endsWith('.map') && !file.endsWith('sw.js'));
const hash = createHash('sha256');
for (const file of files.sort()) { hash.update(file); hash.update(await readFile(file)); }
const version = hash.digest('hex').slice(0, 16);
const urls = files.map(file => '/' + path.relative('out', file).split(path.sep).map(encodeURIComponent).join('/'));
urls.push('/');
const template = await readFile('scripts/sw-template.js', 'utf8');
await writeFile('out/sw.js', template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(urls)));
console.log(`Offline: ${urls.length} recursos; versión ${version}`);
