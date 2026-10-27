export const DELAYS = [5, 10, 15, 20, 30] as const;
export type DelaySeconds = (typeof DELAYS)[number];
export const MAX_BYTES = 64 * 1024 * 1024;
export const PROFILES = [
  { width: 1280, height: 720, fps: 30, label: '720p · 30 FPS' },
  { width: 1280, height: 720, fps: 24, label: '720p · 24 FPS' },
  { width: 854, height: 480, fps: 24, label: '480p · 24 FPS' },
] as const;
export type Quality = 0 | 1 | 2;

export function isDelay(value: unknown): value is DelaySeconds {
  return DELAYS.includes(value as DelaySeconds);
}

export function synchronization(now: number, current: number) {
  const error = now - current;
  if (Math.abs(error) > 0.9) return { seek: now, rate: 1 };
  return { seek: null, rate: Math.abs(error) < 0.15 ? 1 : Math.min(1.06, Math.max(0.94, 1 + error * 0.1)) };
}

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'No tenemos permiso para usar la cámara. Permite el acceso en los ajustes del navegador y vuelve a iniciar.';
  if (name === 'NotFoundError') return 'No encontramos una cámara. Comprueba que el dispositivo tenga una disponible.';
  if (name === 'NotReadableError') return 'No podemos abrir la cámara. Cierra otras aplicaciones que puedan estar usándola y vuelve a intentarlo.';
  return error instanceof Error ? error.message : 'No se pudo iniciar la cámara. Vuelve a intentarlo.';
}

export class BufferBudget {
  private entries: { time: number; bytes: number }[] = [];
  bytes = 0;
  add(time: number, bytes: number) {
    this.bytes += bytes;
    this.entries.push({ time, bytes });
    if (this.bytes > MAX_BYTES) throw new Error('El vídeo ha alcanzado el límite de memoria. Reinicia con una calidad inferior.');
  }
  removeBefore(time: number) {
    while (this.entries.length && this.entries[0].time < time) this.bytes -= this.entries.shift()!.bytes;
  }
  clear() { this.entries = []; this.bytes = 0; }
}
