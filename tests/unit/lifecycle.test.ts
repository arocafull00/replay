import { afterEach, describe, expect, it, vi } from 'vitest';
import { DelayEngine, type EngineEvent } from '../../src/lib/video/engine';

function environment(getUserMedia: () => Promise<unknown>) {
  vi.stubGlobal('document', new EventTarget()); vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
  vi.stubGlobal('MediaSource', { isTypeSupported: () => true });
}
function target() { return { pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLVideoElement; }
afterEach(() => vi.unstubAllGlobals());
describe('camera lifecycle', () => {
  it('releases a stream that arrives after cancelling the permission dialog', async () => {
    let resolve!: (stream: unknown) => void;
    environment(() => new Promise(done => { resolve = done; }));
    const events: EngineEvent[] = [];
    const engine = new DelayEngine(event => events.push(event));
    const stop = vi.fn();
    const starting = engine.start({ delaySeconds: 10, quality: 0, target: target() });
    engine.stop(); engine.stop();
    resolve({ getTracks: () => [{ stop }] });
    await starting;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(events.filter(e => e.type === 'error')).toHaveLength(0);
    expect(events.at(-1)).toEqual({ type: 'state', state: 'ready' });
    engine.dispose();
  });
  it('reports rejected permission and leaves the player clean', async () => {
    environment(() => Promise.reject(new DOMException('', 'NotAllowedError')));
    const events: EngineEvent[] = [];
    const engine = new DelayEngine(event => events.push(event));
    const player = target();
    await engine.start({ delaySeconds: 5, quality: 0, target: player });
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringMatching(/permiso/) });
    expect(player.removeAttribute).toHaveBeenCalledWith('src');
    engine.dispose();
  });
  it('falls back only on constraints, never repeats a denied permission', async () => {
    const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException('', 'OverconstrainedError')).mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    environment(getUserMedia);
    const engine = new DelayEngine(() => {});
    await engine.start({ delaySeconds: 5, quality: 0, target: target() });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].video.frameRate.ideal).toBe(24);
    engine.dispose();
  });
  it('does not revive a disposed instance', async () => {
    const getUserMedia = vi.fn(); environment(getUserMedia);
    const engine = new DelayEngine(() => {}); engine.dispose();
    await engine.start({ delaySeconds: 5, quality: 0, target: target() });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
