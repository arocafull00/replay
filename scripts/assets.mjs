import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

await mkdir('public', { recursive: true });
const background = '#292a2b';
// Keep the approved satin artwork as the source; builds only resize/export it.
const master = await sharp('assets/branding/replay-athlete-master.png').trim().png().toBuffer();
const small = await readFile('assets/branding/favicon.svg');
const icon = size => sharp(master).resize(size, size, { fit: 'contain', background: '#00000000' }).png();

await Promise.all([
  icon(96).toFile('public/mark.png'),
  ...[192, 512].map(size => icon(size).toFile(`public/icon-${size}.png`)),
  (async () => {
    const apple = await icon(180).toBuffer();
    await sharp(apple).flatten({ background }).png().toFile('public/apple-touch-icon.png');
  })(),
  writeFile('public/favicon.svg', small),
  sharp(small).resize(48).png().toFile('public/favicon.png'),
  // The smaller tile keeps the complete athlete/replay inside the mask safe zone.
  (async () => {
    const inset = await icon(384).toBuffer();
    await sharp({ create: { width: 512, height: 512, channels: 4, background } })
      .composite([{ input: inset, left: 64, top: 64 }]).flatten({ background }).png().toFile('public/icon-maskable.png');
  })(),
]);

// A multi-resolution ICO with PNG payloads, supported by modern browsers.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(size => sharp(small).resize(size).png().toBuffer()));
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
await writeFile('public/favicon.ico', Buffer.concat([directory, ...frames]));
await rm('public/mark.svg', { force: true });

// Keep the whole brand in the central square: chat previews crop the landscape
// image to a small thumbnail, where a tagline would be unreadable.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="${background}"/><text x="600" y="552" text-anchor="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="bold">rePlay</text></svg>`;
const ogIcon = await icon(380).toBuffer();
const ogImage = await sharp(Buffer.from(og))
  .composite([{ input: ogIcon, left: 410, top: 60 }]).png().toBuffer();
await Promise.all([
  writeFile('public/og.png', ogImage),
  writeFile('public/replay-share-v2.png', ogImage),
]);
