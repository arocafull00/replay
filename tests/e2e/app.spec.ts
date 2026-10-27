import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function syntheticCamera(page: Page) {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.assign(window, { testStreams: streams });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async (constraints: MediaStreamConstraints) => {
      if (constraints.audio !== false) throw new Error('Microphone must never be requested');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext('2d')!;
      const start = performance.now();
      const paint = () => {
        const seconds = (performance.now() - start) / 1000;
        context.fillStyle = '#183f28'; context.fillRect(0, 0, 1280, 720);
        context.strokeStyle = 'white'; context.lineWidth = 5; context.strokeRect(80, 80, 1120, 560);
        context.beginPath(); context.moveTo(640, 80); context.lineTo(640, 640); context.stroke();
        context.fillStyle = 'white'; context.font = '80px monospace'; context.fillText(`${seconds.toFixed(2)} s`, 120, 220);
        context.beginPath(); context.arc(180 + (seconds * 100) % 900, 470, 35, 0, Math.PI * 2); context.fill();
      };
      paint(); const timer = setInterval(paint, 1000 / 30);
      const stream = canvas.captureStream(30); streams.push(stream);
      const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => { clearInterval(timer); stop(); };
      return stream;
    } });
  });
}

test('configuration, metadata, accessibility basics and no early camera access', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '10 s', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as unknown as { testStreams: unknown[] }).testStreams.length)).toBe(0);
  await page.getByRole('button', { name: '20 s', exact: true }).click(); await page.reload();
  await expect(page.getByRole('button', { name: '20 s', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const width = await page.evaluate(() => document.documentElement.scrollWidth); expect(width).toBeLessThanOrEqual(1280);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og.png/);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});

for (const delay of [5, 10, 30]) test(`continuous encoded playback with ${delay}s delay and complete cleanup`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button', { name: `${delay} s`, exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.player-status')).toContainText('Sesión en marcha', { timeout: (delay + 15) * 1000 });
  if (delay === 5) {
    await page.mouse.click(80, 200);
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: 'test-results/playing.png' });
  }
  await expect.poll(async () => Number((await page.locator('.player [data-testid="actual-delay"]').textContent())?.replace(' s', ''))).toBeGreaterThan(delay - 1);
  for (let sample = 0; sample < 8; sample++) {
    await page.waitForTimeout(1000);
    const value = Number((await page.locator('.player [data-testid="actual-delay"]').textContent())?.replace(' s', ''));
    expect(Math.abs(value - delay)).toBeLessThanOrEqual(1);
    await expect(page.locator('.player-status')).toContainText('Sesión en marcha');
  }
  const playback = await page.locator('video').evaluate(v => ({ time: (v as HTMLVideoElement).currentTime, frames: (v as HTMLVideoElement).getVideoPlaybackQuality().totalVideoFrames }));
  expect(playback.time).toBeGreaterThan(5); expect(playback.frames).toBeGreaterThan(100);
  await page.mouse.click(80, 200); await page.getByRole('button', { name: 'Detener', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { testStreams: MediaStream[] }).testStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
  await expect(page.locator('video')).not.toHaveAttribute('src', /blob:/);
  expect(errors).toEqual([]);
});

test('installed resources open offline and include the video engine', async ({ page, context }) => {
  await syntheticCamera(page); await page.goto('/');
  await expect(page.getByTestId('offline-status')).toContainText('Lista para usar sin conexión', { timeout: 45_000 });
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '5 s', exact: true }).click(); await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.player-status')).toContainText('Sesión en marcha');
  await page.mouse.click(80, 200); await page.getByRole('button', { name: 'Detener', exact: true }).click();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['voley-delay:delay:v1']);
  const keys = await page.evaluate(async () => { const all: string[] = []; for (const name of await caches.keys()) { const cache = await caches.open(name); all.push(...(await cache.keys()).map(r => r.url)); } return all; });
  expect(keys.every(url => !url.startsWith('blob:'))).toBe(true);
});

test('permission denial is actionable', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('denied', 'NotAllowedError'); } }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.notice[role="alert"]')).toContainText('permiso'); await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
});

test('mobile portrait does not overflow and offers large controls', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  const start = await page.getByRole('button', { name: 'Iniciar', exact: true }).boundingBox(); expect(start!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({ path: 'test-results/mobile-setup.png', fullPage: true });
});

test('backgrounding stops capture and requires a new session', async ({ page }) => {
  await syntheticCamera(page); await page.goto('/');
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.player-status')).toContainText('Preparando el vídeo');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
  await expect(page.locator('.notice')).toContainText('se ha detenido');
  expect(await page.evaluate(() => (window as unknown as { testStreams: MediaStream[] }).testStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
});

test('a camera returned after stop is released without starting playback', async ({ page }) => {
  await syntheticCamera(page);
  await page.goto('/');
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async (constraints: MediaStreamConstraints) => {
      await new Promise<void>(resolve => Object.assign(window, { resolvePermission: resolve }));
      return original(constraints);
    } });
  });
  await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.player-status')).toContainText('Abriendo la cámara');
  await page.getByRole('button', { name: 'Detener', exact: true }).click();
  await page.evaluate(() => (window as unknown as { resolvePermission: () => void }).resolvePermission());
  await expect.poll(() => page.evaluate(() => (window as unknown as { testStreams: MediaStream[] }).testStreams[0]?.getTracks()[0]?.readyState)).toBe('ended');
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
});

test('updates wait for active sessions in all windows', async ({ page, context }) => {
  await syntheticCamera(page); await page.goto('/');
  await expect(page.getByTestId('offline-status')).toContainText('Lista para usar sin conexión');
  const idle = await context.newPage(); await idle.goto('/');
  await expect(idle.getByTestId('offline-status')).toContainText('Lista para usar sin conexión');
  await page.getByRole('button', { name: '5 s', exact: true }).click(); await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
  await expect(page.locator('.player-status')).toContainText('Sesión en marcha');
  const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
  await idle.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('/sw.js?test-update=1', { scope: '/' });
    if (!reg.waiting) await new Promise<void>(resolve => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') resolve(); });
    });
    reg.waiting?.postMessage({ type: 'ACTIVATE_WHEN_IDLE' });
  });
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(before);
  await expect(page.locator('.player-status')).toContainText('Sesión en marcha');
  await page.mouse.click(80, 200); await page.getByRole('button', { name: 'Detener', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('test-update=1');
  await expect.poll(() => idle.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('test-update=1');
  await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).toBeVisible();
});
