import { BufferBudget, cameraError, CLIP_BYTES, CLIP_SECONDS, MAX_BYTES, PROFILES, synchronization, type DelaySeconds, type Quality } from './policy';

export type EngineState = 'ready' | 'requesting' | 'buffering' | 'playing' | 'recovering' | 'stopping' | 'error';
export type Metrics = {
  elapsed: number; actualDelay: number | null; buffered: number; bytes: number;
  droppedFrames: number; totalFrames: number;
};
export type EngineEvent =
  | { type: 'state'; state: EngineState }
  | { type: 'progress'; seconds: number }
  | { type: 'quality'; width: number; height: number; fps: number; reduced: boolean }
  | { type: 'metrics'; metrics: Metrics }
  | { type: 'error'; message: string; playbackBlocked?: boolean; lowerQuality?: boolean }
  | { type: 'interrupted'; message: string };
type StartOptions = { delaySeconds: DelaySeconds; quality: Quality; target: HTMLVideoElement };
const MIME = 'video/webm;codecs=vp8';

function sourceOpened(source: MediaSource, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelado', 'AbortError')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('El reproductor no respondió. Vuelve a iniciar.')); }, 8000);
    const cleanup = () => { clearTimeout(timeout); source.removeEventListener('sourceopen', done); signal.removeEventListener('abort', abort); };
    source.addEventListener('sourceopen', done, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
function vint(bytes: Uint8Array, at: number) {
  const first = bytes[at];
  if (!first) return null;
  const length = Math.clz32(first) - 23;
  if (at + length > bytes.length) return null;
  let value = first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
  return { length, value };
}
function isCluster(bytes: Uint8Array, at: number) {
  return CLUSTER.every((byte, i) => bytes[at + i] === byte);
}
function element(bytes: Uint8Array, at: number) {
  const id = vint(bytes, at);
  const size = id && vint(bytes, at + id.length);
  if (!id || !size) return null;
  const start = at + id.length + size.length;
  return { id: bytes[at], start, end: start + size.value };
}
function keyCluster(bytes: Uint8Array, at: number) {
  if (!isCluster(bytes, at)) return null;
  const size = vint(bytes, at + 4);
  const timecode = size && element(bytes, at + 4 + size.length);
  if (!timecode || timecode.id !== 0xe7 || timecode.end - timecode.start > 8) return null;
  let value = 0;
  for (let i = timecode.start; i < timecode.end; i++) value = value * 256 + bytes[i];
  const block = element(bytes, timecode.end);
  if (!block || block.end > bytes.length) return null;
  if (block.id === 0xa3) {
    const track = vint(bytes, block.start);
    return track && bytes[block.start + track.length + 2] & 0x80 ? value : null;
  }
  if (block.id !== 0xa0) return null;
  for (let p = block.start; p < block.end;) {
    const child = element(bytes, p);
    if (!child || child.id === 0xfb) return null;
    p = child.end;
  }
  return value;
}

export class DelayEngine {
  private emit: (event: EngineEvent) => void;
  private state: EngineState = 'ready';
  private generation = 0;
  private abort: AbortController | null = null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private source: MediaSource | null = null;
  private buffer: SourceBuffer | null = null;
  private target: HTMLVideoElement | null = null;
  private url: string | null = null;
  private queue: Blob[] = [];
  private queuedBytes = 0;
  private header: Promise<Uint8Array<ArrayBuffer>> | null = null;
  private raw: { time: number; blob: Blob }[] = [];
  private rawBytes = 0;
  private draining = false;
  private budget = new BufferBudget();
  private clock = 0;
  private delay: DelaySeconds = 10;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastMetric = 0;
  private lastProgress = 0;
  private lastEnd = 0;
  private lastRemoval = 0;
  private playingRequested = false;
  private playbackBlocked = false;
  private recoveryAt = 0;
  private wake: WakeLockSentinel | null = null;
  private frameCallback: number | null = null;
  private presentedTime: number | null = null;
  private presentedAt = 0;
  private lastPlayhead = 0;
  private playheadAt = 0;
  private disposed = false;

  constructor(emit: (event: EngineEvent) => void) {
    this.emit = emit;
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.interrupt);
  }
  private setState(state: EngineState) { this.state = state; this.emit({ type: 'state', state }); }
  static supported() {
    return !!(globalThis.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      globalThis.MediaRecorder?.isTypeSupported(MIME) && globalThis.MediaSource?.isTypeSupported(MIME));
  }
  async start({ delaySeconds, quality, target }: StartOptions) {
    if (this.disposed) return;
    this.stop();
    const generation = this.generation;
    this.delay = delaySeconds;
    this.target = target;
    this.abort = new AbortController();
    this.setState('requesting');
    try {
      if (!DelayEngine.supported()) throw new Error('Este navegador no admite el motor de vídeo de esta versión. Prueba Chrome actualizado en Android. iPhone está en evaluación.');
      let stream: MediaStream | null = null;
      for (let index = quality; index < PROFILES.length; index++) {
        const profile = PROFILES[index];
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
            facingMode: { ideal: 'environment' }, width: { ideal: profile.width, max: profile.width },
            height: { ideal: profile.height, max: profile.height }, frameRate: { ideal: profile.fps, max: profile.fps },
          } });
          break;
        } catch (error) {
          if (generation !== this.generation) return;
          if (!(error instanceof DOMException) || error.name !== 'OverconstrainedError' || index === 2) throw error;
        }
      }
      if (!stream) throw new Error('No se pudo abrir una cámara compatible.');
      // getUserMedia cannot be aborted: release any stream returned after cancellation.
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      this.emit({ type: 'quality', width: settings.width ?? 0, height: settings.height ?? 0, fps: settings.frameRate ?? 0,
        reduced: quality > 0 || (settings.height ?? 0) < 720 || (settings.frameRate ?? 0) < 29 });
      track.onended = this.interrupt;
      track.onmute = this.interrupt;
      const source = new MediaSource();
      this.source = source;
      this.url = URL.createObjectURL(source);
      target.muted = true;
      target.playsInline = true;
      const opened = sourceOpened(source, this.abort!.signal);
      target.src = this.url;
      target.load();
      await opened;
      if (generation !== this.generation) return;
      this.buffer = source.addSourceBuffer(MIME);
      this.buffer.addEventListener('updateend', this.updated);
      this.buffer.addEventListener('error', this.mediaError);
      target.addEventListener('error', this.mediaError);
      const recorder = new MediaRecorder(stream, { mimeType: MIME, videoBitsPerSecond: 4_000_000, videoKeyFrameIntervalDuration: 1000 } as MediaRecorderOptions);
      this.recorder = recorder;
      recorder.ondataavailable = event => {
        if (generation !== this.generation || !event.data.size) return;
        try {
          this.budget.add(this.elapsed(), event.data.size);
          this.queue.push(event.data);
          this.queuedBytes += event.data.size;
          if (this.queuedBytes > MAX_BYTES / 4) throw new Error('El dispositivo no procesa el vídeo a tiempo. Reinicia con una calidad inferior.');
          this.keep(event.data);
          void this.drain();
        } catch (error) { this.fail(cameraError(error), true); }
      };
      recorder.onerror = () => this.fail('La captura de vídeo se interrumpió. Vuelve a iniciar.', true);
      recorder.onstop = () => { if (generation === this.generation) this.fail('La cámara dejó de capturar vídeo. Vuelve a iniciar.'); };
      this.clock = performance.now();
      this.lastProgress = this.clock;
      this.playheadAt = this.clock;
      recorder.start(250);
      this.setState('buffering');
      this.observeFrame(generation);
      this.timer = setInterval(() => this.tick(), 250);
      if (navigator.wakeLock) void navigator.wakeLock.request('screen').then(lock => {
        if (generation !== this.generation) void lock.release(); else this.wake = lock;
      }).catch(() => {});
    } catch (error) {
      if (generation === this.generation) this.fail(cameraError(error));
    }
  }
  private elapsed() { return (performance.now() - this.clock) / 1000; }
  private keep(blob: Blob) {
    if (!this.header) this.header = blob.arrayBuffer().then(buffer => {
      const bytes = new Uint8Array(buffer);
      const end = bytes.findIndex((_, i) => isCluster(bytes, i));
      return end < 0 ? bytes : bytes.slice(0, end);
    });
    this.raw.push({ time: this.elapsed(), blob });
    this.rawBytes += blob.size;
    this.trimRaw();
  }
  private trimRaw() {
    const oldest = this.elapsed() - this.delay - CLIP_SECONDS - 3;
    while (this.raw.length > 1 && (this.raw[0].time < oldest || this.rawBytes > CLIP_BYTES)) this.rawBytes -= this.raw.shift()!.blob.size;
  }
  async clip(): Promise<{ blob: Blob; duration: number } | null> {
    const generation = this.generation;
    const target = this.target;
    if (this.state !== 'playing' || !target || !this.header || !this.raw.length) throw new Error('Espera a que el vídeo esté en marcha para guardar un clip.');
    const end = target.currentTime;
    const [header, recent] = await Promise.all([this.header, new Blob(this.raw.map(entry => entry.blob)).arrayBuffer()]);
    if (generation !== this.generation) return null;
    const bytes = new Uint8Array(recent);
    let from = -1;
    let timecode: number | null = null;
    for (let i = bytes.indexOf(CLUSTER[0]); i >= 0; i = bytes.indexOf(CLUSTER[0], i + 1)) {
      timecode = keyCluster(bytes, i);
      if (timecode !== null) { from = i; break; }
    }
    if (from < 0 || timecode === null || timecode / 1000 >= end) throw new Error('Todavía no hay vídeo suficiente para el clip. Prueba en unos segundos.');
    const { BlobSource, BufferTarget, canEncodeVideo, Conversion, Input, Mp4OutputFormat, Output, WEBM } = await import('mediabunny');
    if (!(await canEncodeVideo('avc'))) throw new Error('Este navegador no puede crear vídeos MP4.');
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const start = Math.max(timecode / 1000, end - CLIP_SECONDS);
    try {
      const conversion = await Conversion.init({
        input: new Input({ formats: [WEBM], source: new BlobSource(new Blob([header, bytes.subarray(from)])) }),
        output, video: { codec: 'avc' }, trim: { start, end }, showWarnings: false,
      });
      await conversion.execute();
    } catch { throw new Error('No se pudo convertir el clip a MP4.'); }
    if (generation !== this.generation || !output.target.buffer) return null;
    return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), duration: end - start };
  }
  private updated = () => { void this.drain(); };
  private mediaError = () => this.fail('El navegador no pudo reproducir el vídeo continuo. Reinicia con una calidad inferior.', true);
  private async drain() {
    const buffer = this.buffer;
    if (!buffer || buffer.updating || this.draining) return;
    const generation = this.generation;
    const cutoff = Math.floor((this.target?.currentTime ?? 0) - 3);
    try {
      if (cutoff > this.lastRemoval + 1 && buffer.buffered.length && buffer.buffered.start(0) < cutoff) {
        this.lastRemoval = cutoff;
        // Removal is serialized with appends. Keep playback dependencies behind the playhead.
        buffer.remove(0, cutoff);
        this.budget.removeBefore(cutoff - 2);
        return;
      }
      const blob = this.queue.shift();
      if (!blob) return;
      this.draining = true;
      const bytes = await blob.arrayBuffer();
      if (generation !== this.generation) return;
      this.queuedBytes -= blob.size;
      buffer.appendBuffer(bytes);
    } catch (error) {
      if (generation === this.generation) this.fail(cameraError(error), true);
    } finally { if (generation === this.generation) this.draining = false; }
  }
  private observeFrame(generation: number) {
    const target = this.target;
    if (!target?.requestVideoFrameCallback) return;
    this.frameCallback = target.requestVideoFrameCallback((now, metadata) => {
      if (generation !== this.generation) return;
      this.presentedTime = metadata.mediaTime;
      this.presentedAt = now;
      this.observeFrame(generation);
    });
  }
  private tick() {
    const target = this.target;
    const buffer = this.buffer;
    if (!target || !buffer) return;
    const elapsed = this.elapsed();
    const now = performance.now();
    if (target.currentTime > this.lastPlayhead + 0.01) { this.lastPlayhead = target.currentTime; this.playheadAt = now; }
    const ranges = buffer.buffered;
    const end = ranges.length ? ranges.end(ranges.length - 1) : 0;
    if (end > this.lastEnd + 0.01) { this.lastEnd = end; this.lastProgress = now; }
    if (now - this.lastProgress > 10_000) { this.fail('No está llegando vídeo nuevo. Comprueba la cámara y vuelve a iniciar.', true); return; }
    const desired = elapsed - this.delay;
    let inside = false;
    let gap = false;
    for (let i = 0; i < ranges.length; i++) {
      if (desired >= ranges.start(i) && desired < ranges.end(i) - 0.15) inside = true;
      else if (i > 0 && desired >= ranges.end(i - 1) - 0.15 && desired < ranges.start(i) && ranges.start(i) - desired < 1.5) gap = true;
    }
    const available = ranges.length ? end - ranges.start(ranges.length - 1) : 0;
    this.emit({ type: 'progress', seconds: Math.min(this.delay, available) });
    if (desired >= 0 && inside && !this.playbackBlocked) {
      if (!this.playingRequested) {
        this.playingRequested = true;
        target.currentTime = desired;
        const generation = this.generation;
        void target.play().catch(() => {
          if (generation !== this.generation) return;
          this.playingRequested = false;
          this.playbackBlocked = true;
          this.emit({ type: 'error', message: 'Toca «Reproducir vídeo» para permitir la reproducción.', playbackBlocked: true });
        });
      }
      const sync = synchronization(desired, target.currentTime);
      if (sync.seek !== null) target.currentTime = sync.seek;
      target.playbackRate = sync.rate;
      const presenting = typeof target.requestVideoFrameCallback === 'function' ? this.presentedTime !== null && now - this.presentedAt < 2000 : now - this.playheadAt < 2000;
      if (!target.paused && target.readyState >= 2 && presenting) {
        if (this.state !== 'playing') this.setState('playing');
        this.recoveryAt = 0;
      } else if (elapsed > this.delay + 3 && !this.recoveryAt) {
        this.recoveryAt = now;
        this.setState('recovering');
        target.pause();
        this.playingRequested = false;
      }
    } else if (this.state === 'playing' && !this.playbackBlocked && !gap) {
      this.setState('recovering');
      this.recoveryAt = now;
      target.pause();
      this.playingRequested = false;
    }
    // Real memory includes browser-owned coded buffers. Detect oversized time windows too.
    if (ranges.length && end - ranges.start(0) > this.delay + 8) { this.fail('El navegador no está liberando el búfer. Reinicia con una calidad inferior.', true); return; }
    if (this.recoveryAt && now - this.recoveryAt > 8000) { this.fail('No se ha podido recuperar la reproducción. Reinicia con una calidad inferior.', true); return; }
    if (now - this.lastMetric >= 1000) {
      this.lastMetric = now;
      const quality = target.getVideoPlaybackQuality?.();
      const displayed = this.presentedTime !== null && now - this.presentedAt < 1500 ? this.presentedTime : null;
      this.emit({ type: 'metrics', metrics: { elapsed, actualDelay: displayed === null ? null : elapsed - displayed,
        buffered: available, bytes: this.budget.bytes + this.rawBytes, droppedFrames: quality?.droppedVideoFrames ?? 0, totalFrames: quality?.totalVideoFrames ?? 0 } });
    }
    this.trimRaw();
    void this.drain();
  }
  resumePlayback() {
    const generation = this.generation;
    if (!this.target) return;
    void this.target.play().then(() => {
      if (generation !== this.generation) return;
      this.playbackBlocked = false; this.playingRequested = true;
    }).catch(() => this.emit({ type: 'error', message: 'El navegador sigue bloqueando la reproducción. Prueba a detener e iniciar de nuevo.', playbackBlocked: true }));
  }
  private visibility = () => { if (document.visibilityState === 'hidden') this.interrupt(); };
  private interrupt = () => {
    if (['ready', 'error', 'stopping'].includes(this.state)) return;
    this.stop();
    this.emit({ type: 'interrupted', message: 'La sesión se ha detenido y la cámara se ha liberado. Pulsa «Iniciar» para empezar de nuevo.' });
  };
  private fail(message: string, lowerQuality = false) {
    this.stop();
    this.setState('error');
    this.emit({ type: 'error', message, lowerQuality });
  }
  stop() {
    ++this.generation;
    if (this.state !== 'ready') this.setState('stopping');
    this.abort?.abort(); this.abort = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.recorder) {
      this.recorder.ondataavailable = this.recorder.onerror = this.recorder.onstop = null;
      if (this.recorder.state !== 'inactive') this.recorder.stop();
    }
    this.recorder = null;
    this.stream?.getTracks().forEach(track => { track.onended = track.onmute = null; track.stop(); });
    this.stream = null;
    if (this.buffer) { this.buffer.removeEventListener('updateend', this.updated); this.buffer.removeEventListener('error', this.mediaError); }
    this.buffer = null; this.source = null;
    if (this.target) {
      if (this.frameCallback !== null) this.target.cancelVideoFrameCallback?.(this.frameCallback);
      this.target.removeEventListener('error', this.mediaError);
      this.target.pause(); this.target.removeAttribute('src'); this.target.load();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    if (this.wake) void this.wake.release().catch(() => {});
    this.wake = null; this.url = null; this.target = null; this.frameCallback = null;
    this.queue = []; this.queuedBytes = 0; this.draining = false; this.budget.clear();
    this.header = null; this.raw = []; this.rawBytes = 0;
    this.lastEnd = this.lastRemoval = this.lastMetric = this.recoveryAt = 0;
    this.presentedTime = null; this.lastPlayhead = this.playheadAt = 0; this.playingRequested = this.playbackBlocked = false;
    this.setState('ready');
  }
  dispose() {
    this.stop(); this.disposed = true;
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.interrupt);
    this.emit = () => {};
  }
}
