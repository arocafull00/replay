'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DelayEngine, type EngineEvent, type EngineState, type Metrics } from '@/lib/video/engine';
import { DELAYS, isDelay, PROFILES, type DelaySeconds, type Quality } from '@/lib/video/policy';
import { usePwa } from '@/lib/use-pwa';
import { Onboarding, useOnboardingSeen } from '@/components/onboarding/onboarding';
import { useClerk } from '@clerk/react';

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
  const { signOut } = useClerk();
  const onboardingSeen = useOnboardingSeen();
  const [guideOpen, setGuideOpen] = useState(false);
  const showOnboarding = (!onboardingSeen || guideOpen) && !active;

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
    <div className={`setup ${active ? 'hidden' : ''}`} inert={showOnboarding}>
      <header className="app-header"><Link className="wordmark" href="/" prefetch={false} aria-label="rePlay, inicio"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay</Link><div className="header-actions"><button type="button" className="how-button" onClick={() => setGuideOpen(true)}>Cómo funciona</button><button type="button" className="how-button" onClick={() => void signOut()}>Salir</button></div></header>
      <div className="setup-body">
      <section className="intro" aria-labelledby="app-title">
        <h1 id="app-title">Revisa tu movimiento<br /><span>unos segundos después.</span></h1>
      </section>
      <section className="configuration" aria-label="Preparar sesión">
        <div className="settings">
          <fieldset><legend>Retraso del vídeo</legend><div className="delay-options">{DELAYS.map(seconds => <button key={seconds} type="button" aria-pressed={delay === seconds} onClick={() => saveDelay(seconds)}>{seconds}<span> s</span></button>)}</div><p className="field-help">Elige el tiempo que necesitas para acercarte a la pantalla.</p></fieldset>
          <label className="quality-label" htmlFor="quality">Calidad del vídeo</label>
          <select id="quality" value={quality} onChange={event => setQuality(Number(event.target.value) as Quality)}>{PROFILES.map((profile, index) => <option value={index} key={profile.label}>{profile.label}{index === 0 ? ' · recomendada' : ''}</option>)}</select>
        </div>
      </section>
      {!active && message && <div className="notice" role={state === 'error' ? 'alert' : 'status'}><p>{message}</p>{lowerQuality && quality < 2 && <button className="button secondary" onClick={() => start((quality + 1) as Quality)}>Reiniciar con menor calidad</button>}</div>}
      {pwa.canInstall && !pwa.installed && <div className="installation-actions"><button className="button secondary" onClick={() => void pwa.installApp()}>Instalar aplicación</button></div>}
      {metrics && <Diagnostics metrics={metrics} actualQuality={actualQuality} />}
      </div>
      <div className="start-bar"><button className="button primary start-button" onClick={() => start()}><span aria-hidden="true">▶</span> Iniciar</button></div>
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
    {showOnboarding && <Onboarding pwa={pwa} delay={delay} onDelay={saveDelay} onClose={() => setGuideOpen(false)} />}
  </main>;
}

function Diagnostics({ metrics, actualQuality }: { metrics: Metrics; actualQuality: string }) {
  return <details className="diagnostics"><summary>Datos para las pruebas</summary><dl><div><dt>Calidad concedida</dt><dd>{actualQuality}</dd></div><div><dt>Tiempo de sesión</dt><dd data-testid="elapsed">{metrics.elapsed.toFixed(1)} s</dd></div><div><dt>Retraso estimado</dt><dd data-testid="actual-delay">{metrics.actualDelay === null ? 'Esperando fotogramas' : `${metrics.actualDelay.toFixed(2)} s`}</dd></div><div><dt>Ventana de vídeo</dt><dd>{metrics.buffered.toFixed(1)} s</dd></div><div><dt>Datos comprimidos contabilizados</dt><dd data-testid="buffer-bytes">{(metrics.bytes / 1024 / 1024).toFixed(2)} MiB</dd></div><div><dt>Fotogramas descartados</dt><dd>{metrics.droppedFrames} / {metrics.totalFrames}</dd></div></dl><p>El retraso usa el reloj multimedia y no mide toda la latencia de cámara y pantalla. La memoria indicada no incluye todos los recursos del navegador. Verifica el resultado con un reloj externo.</p></details>;
}
