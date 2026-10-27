'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DelayEngine, type EngineEvent, type EngineState, type Metrics } from '@/lib/video/engine';
import { DELAYS, isDelay, PROFILES, type DelaySeconds, type Quality } from '@/lib/video/policy';
import { usePwa } from '@/lib/use-pwa';

const STORAGE_KEY = 'voley-delay:delay:v1';
function readDelay(): DelaySeconds { try { const value = Number(localStorage.getItem(STORAGE_KEY)); return isDelay(value) ? value : 10; } catch { return 10; } }
function subscribeDelay(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener('delay-setting', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('delay-setting', callback); }; }
function saveDelay(value: DelaySeconds) { try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {} window.dispatchEvent(new Event('delay-setting')); }
const labels: Record<EngineState, string> = { ready: 'Preparada para entrenar', requesting: 'Abriendo la cámara', buffering: 'Preparando el vídeo', playing: 'Sesión en marcha', recovering: 'Recuperando el vídeo', stopping: 'Liberando la cámara', error: 'Sesión detenida' };

export function DelayApp() {
  const delay = useSyncExternalStore<DelaySeconds>(subscribeDelay, readDelay, () => 10);
  const [state, setState] = useState<EngineState>('ready');
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState<Quality>(0);
  const [actualQuality, setActualQuality] = useState('');
  const [reduced, setReduced] = useState(false);
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [lowerQuality, setLowerQuality] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [controls, setControls] = useState(true);
  const [sessionDelay, setSessionDelay] = useState<DelaySeconds>(10);
  const engine = useRef<DelayEngine | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = !['ready', 'error'].includes(state);
  const pwa = usePwa(active);

  const receive = useCallback((event: EngineEvent) => {
    if (event.type === 'state') { setState(event.state); if (event.state === 'playing') { setBlocked(false); setMessage(''); } }
    if (event.type === 'progress') setProgress(event.seconds);
    if (event.type === 'quality') { setActualQuality(`${event.width} × ${event.height} · ${Math.round(event.fps)} FPS`); setReduced(event.reduced); }
    if (event.type === 'metrics') setMetrics(event.metrics);
    if (event.type === 'error') { setMessage(event.message); setBlocked(!!event.playbackBlocked); setLowerQuality(!!event.lowerQuality); }
    if (event.type === 'interrupted') setMessage(event.message);
  }, []);
  useEffect(() => {
    const instance = new DelayEngine(receive);
    engine.current = instance;
    return () => { instance.dispose(); engine.current = null; };
  }, [receive]);
  useEffect(() => {
    if (active) { document.body.classList.add('session-active'); }
    else { document.body.classList.remove('session-active'); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }
    return () => document.body.classList.remove('session-active');
  }, [active]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  function showControls() {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!toolbar.current?.contains(document.activeElement)) setControls(false);
    }, 4000);
  }
  function start(nextQuality: Quality = quality) {
    if (!video.current || !engine.current) return;
    setMessage(''); setBlocked(false); setLowerQuality(false); setProgress(0); setMetrics(null);
    setQuality(nextQuality); setSessionDelay(delay); showControls();
    // Fullscreen is best effort and must be requested inside this user gesture.
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    void engine.current.start({ delaySeconds: delay, quality: nextQuality, target: video.current });
  }
  function stop() { engine.current?.stop(); setMessage(''); setBlocked(false); setLowerQuality(false); }
  const waiting = state === 'requesting' || state === 'buffering' || state === 'recovering';

  return <main>
    <div className={`setup ${active ? 'hidden' : ''}`}>
      <header className="app-header"><Link className="wordmark" href="/" prefetch={false} aria-label="rePlay, inicio"><Image src="/mark.svg" width={36} height={36} alt="" unoptimized />rePlay</Link><span className="version-tag">Versión de pruebas</span></header>
      <section className="intro" aria-labelledby="app-title">
        <p className="context-label">En cada entrenamiento, a tu ritmo</p>
        <h1 id="app-title">Tu movimiento.<br /><span>Unos segundos después.</span></h1>
        <p className="intro-copy">Coloca el móvil en un trípode y revisa tus movimientos sin detener el entrenamiento, sea cual sea tu deporte.</p>
      </section>
      <section className="configuration" aria-label="Preparar sesión">
        <div className="preview-placeholder" aria-hidden="true"><div className="court"><div className="court-net" /><div className="court-circle">↶<span>{delay} s</span></div></div><p>La cámara se abrirá cuando pulses «Iniciar».</p></div>
        <div className="settings">
          <fieldset><legend>¿Cuánto tiempo después?</legend><div className="delay-options">{DELAYS.map(seconds => <button key={seconds} type="button" aria-pressed={delay === seconds} onClick={() => saveDelay(seconds)}>{seconds}<span> s</span></button>)}</div><p className="field-help">Diez segundos suelen dar tiempo para acercarte a mirar.</p></fieldset>
          <label className="quality-label" htmlFor="quality">Calidad de captura</label>
          <select id="quality" value={quality} onChange={event => setQuality(Number(event.target.value) as Quality)}>{PROFILES.map((profile, index) => <option value={index} key={profile.label}>{profile.label}{index === 0 ? ' · recomendada' : ''}</option>)}</select>
          <p className="field-help">Si tu móvil necesita menos carga, elige una calidad inferior.</p>
          <button className="button primary start-button" onClick={() => start()}><span aria-hidden="true">▶</span> Iniciar</button>
          <p className="local-note"><span aria-hidden="true">◉</span> Solo cámara. Sin micrófono ni vídeos guardados.</p>
        </div>
      </section>
      {!active && message && <div className="notice" role={state === 'error' ? 'alert' : 'status'}><p>{message}</p>{lowerQuality && quality < 2 && <button className="button secondary" onClick={() => start((quality + 1) as Quality)}>Reiniciar con menor calidad</button>}</div>}
      <section className="practical" aria-label="Instalación y funcionamiento">
        <div><h2>Llévala al entrenamiento</h2><p>{pwa.offlineReady ? 'Lista para usar sin conexión.' : pwa.offlineError ? 'No se ha podido comprobar la caché. Conéctate y vuelve a abrir la aplicación antes de entrenar sin internet.' : 'Preparando los recursos para abrirla sin conexión…'}</p><span className={`offline-state ${pwa.offlineReady ? 'complete' : ''}`} role="status" data-testid="offline-status">{pwa.offlineReady ? '✓ Lista para usar sin conexión' : pwa.offlineError ? 'Preparación offline pendiente' : 'Comprobando disponibilidad offline'}</span>{pwa.canInstall && <button className="button secondary install-button" onClick={() => void pwa.installApp()}>Instalar aplicación</button>}{pwa.installed && <p>Aplicación instalada.</p>}</div>
        <div className="help"><details><summary>Cómo instalarla</summary><p><strong>Android:</strong> abre esta página en Chrome y pulsa «Instalar aplicación» o utiliza «Añadir a pantalla de inicio» en el menú del navegador.</p><p><strong>iPhone, en evaluación:</strong> abre la página en Safari, pulsa Compartir y «Añadir a pantalla de inicio». La instalación no garantiza que el motor sea compatible.</p><p>Antes de salir de casa, espera al aviso de disponibilidad offline. Si borras los datos del navegador, tendrás que prepararla de nuevo.</p></details><details><summary>Qué ocurre con tu vídeo</summary><p>Las imágenes se procesan en este móvil y se mantienen temporalmente en memoria. No se envían a servidores, no se guardan en la galería y no se solicita el micrófono.</p><p>Al detener la sesión, cerrar la aplicación o pasar a segundo plano se libera la cámara y el búfer. No hay grabaciones que recuperar.</p></details><details><summary>Antes de empezar</summary><p>Usa Chrome actualizado en Android. Coloca el móvil estable y, si puedes, en horizontal. Evita el sol directo y comprueba la batería.</p><p>El retraso es aproximado. Esta versión está pendiente de pruebas de treinta minutos en móviles reales. iPhone está en evaluación.</p></details></div>
      </section>
      {metrics && <Diagnostics metrics={metrics} actualQuality={actualQuality} />}
      <footer>Vuelve a ver tu movimiento y sigue entrenando.<span>Vídeo local · Sin cuentas</span></footer>
    </div>

    <section className={`player ${active ? 'is-active' : ''}`} aria-label="Sesión de vídeo con retraso" aria-hidden={!active} onPointerDown={showControls} onFocus={showControls}>
      <video ref={video} muted playsInline aria-label={`Vídeo de la cámara con ${sessionDelay} segundos de retraso`} />
      {active && <>
        <div className="player-status"><span className={state === 'playing' ? 'status-dot' : 'status-dot waiting'} />{labels[state]}<span className="delay-badge">{sessionDelay} s de retraso</span></div>
        {waiting && <div className="buffer-overlay" role="status"><p>{state === 'requesting' ? 'Permite el acceso a la cámara' : state === 'recovering' ? 'Recuperando el vídeo' : 'Preparando tu vídeo con retraso'}</p><strong>{state === 'requesting' ? '…' : Math.max(0, Math.ceil(sessionDelay - progress))}<span>{state !== 'requesting' ? ' s' : ''}</span></strong><progress max={sessionDelay} value={progress} aria-label="Vídeo disponible en el búfer" /><p className="buffer-hint">{state === 'requesting' ? 'No se solicitará el micrófono.' : 'El vídeo comenzará automáticamente.'}</p></div>}
        {blocked && <div className="playback-prompt" role="alert"><p>{message}</p><button className="button primary" onClick={() => engine.current?.resumePlayback()}>Reproducir vídeo</button></div>}
        <div ref={toolbar} className={`player-controls ${controls || blocked ? '' : 'controls-hidden'}`} onBlur={showControls}>
          <div><strong>{sessionDelay} segundos después</strong><span>{actualQuality || 'Comprobando la cámara…'}{reduced ? ' · Calidad reducida' : ''}</span></div>
          <button className="button stop-button" onClick={stop}><span aria-hidden="true">■</span> Detener</button>
        </div>
        {metrics && <div className={`session-diagnostics ${controls ? '' : 'controls-hidden'}`}><Diagnostics metrics={metrics} actualQuality={actualQuality} /></div>}
      </>}
    </section>
  </main>;
}

function Diagnostics({ metrics, actualQuality }: { metrics: Metrics; actualQuality: string }) {
  return <details className="diagnostics"><summary>Datos para las pruebas</summary><dl><div><dt>Calidad concedida</dt><dd>{actualQuality}</dd></div><div><dt>Tiempo de sesión</dt><dd data-testid="elapsed">{metrics.elapsed.toFixed(1)} s</dd></div><div><dt>Retraso estimado</dt><dd data-testid="actual-delay">{metrics.actualDelay === null ? 'Esperando fotogramas' : `${metrics.actualDelay.toFixed(2)} s`}</dd></div><div><dt>Ventana de vídeo</dt><dd>{metrics.buffered.toFixed(1)} s</dd></div><div><dt>Datos comprimidos contabilizados</dt><dd data-testid="buffer-bytes">{(metrics.bytes / 1024 / 1024).toFixed(2)} MiB</dd></div><div><dt>Fotogramas descartados</dt><dd>{metrics.droppedFrames} / {metrics.totalFrames}</dd></div></dl><p>El retraso usa el reloj multimedia y no mide toda la latencia de cámara y pantalla. La memoria indicada no incluye todos los recursos del navegador. Verifica el resultado con un reloj externo.</p></details>;
}
