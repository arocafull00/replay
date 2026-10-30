'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DelayEngine, type EngineEvent, type EngineState } from '@/lib/video/engine';
import { CLIP_SECONDS, DELAYS, isDelay, PROFILES, type DelaySeconds, type Quality } from '@/lib/video/policy';
import { usePwa } from '@/lib/use-pwa';
import { InstallApp } from '@/components/install-app';
import { Onboarding, useOnboardingSeen } from '@/components/onboarding/onboarding';
import { Clips } from '@/components/clips';
import { addClip, useClips } from '@/lib/clips';
import { useUsage } from '@/lib/usage';
import { useAppSignOut, useAppUserId } from '@/lib/auth';

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
  const [controls, setControls] = useState(true);
  const [sessionDelay, setSessionDelay] = useState<DelaySeconds>(10);
  const [clipping, setClipping] = useState(false);
  const [clipNotice, setClipNotice] = useState('');
  const [clipSaved, setClipSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engine = useRef<DelayEngine | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const logoutDialog = useRef<HTMLDialogElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = !['ready', 'error'].includes(state);
  const pwa = usePwa(active);
  const signOut = useAppSignOut();
  const userId = useAppUserId();
  const clips = useClips(userId);
  const [view, setView] = useState<'setup' | 'clips'>('setup');
  const onboardingSeen = useOnboardingSeen();
  const [guideOpen, setGuideOpen] = useState(false);
  const showOnboarding = (!onboardingSeen || guideOpen) && !active && view === 'setup';
  const track = useUsage();
  const opened = useRef(false);
  const sessionTracked = useRef(true);
  useEffect(() => { if (userId && !opened.current) { opened.current = true; track('open'); } }, [track, userId]);
  useEffect(() => { if (state === 'playing' && !sessionTracked.current) { sessionTracked.current = true; track('session'); } }, [state, track]);

  const receive = useCallback((event: EngineEvent) => {
    if (event.type === 'state') { setState(event.state); if (event.state === 'playing') { setBlocked(false); setMessage(''); } }
    if (event.type === 'progress') setProgress(event.seconds);
    if (event.type === 'quality') { setActualQuality(`${event.width} × ${event.height} · ${Math.round(event.fps)} FPS`); setReduced(event.reduced); }
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
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  useEffect(() => {
    const restore = () => setView(history.state?.clips ? 'clips' : 'setup');
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  function openClips() { history.pushState({ clips: true }, ''); setView('clips'); }

  function showControls() {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!toolbar.current?.contains(document.activeElement)) setControls(false);
    }, 4000);
  }
  function start(nextQuality: Quality = quality) {
    if (!video.current || !engine.current) return;
    setMessage(''); setBlocked(false); setLowerQuality(false); setProgress(0);
    setQuality(nextQuality); setSessionDelay(delay); showControls(); sessionTracked.current = false;
    // Fullscreen is best effort and must be requested inside this user gesture.
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    void engine.current.start({ delaySeconds: delay, quality: nextQuality, target: video.current });
  }
  function stop() { engine.current?.stop(); setMessage(''); setBlocked(false); setLowerQuality(false); setClipNotice(''); }
  function notify(text: string) {
    setClipNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setClipNotice(''), 4000);
  }
  async function saveClip() {
    if (!engine.current || clipping) return;
    setClipping(true);
    try {
      if (!userId) throw new Error('Espera un momento y vuelve a intentarlo.');
      const clip = await engine.current.clip();
      if (!clip) return;
      await addClip(userId, clip.blob, clip.duration);
      track('clip');
      setClipSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setClipSaved(false), 2000);
      notify('Clip guardado en Tus clips.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo guardar el clip.');
    } finally { setClipping(false); showControls(); }
  }
  const waiting = state === 'requesting' || state === 'buffering' || state === 'recovering';

  return <main>
    <div className={`setup ${active || view === 'clips' ? 'hidden' : ''}`} inert={showOnboarding}>
      <header className="app-header"><Link className="wordmark" href="/" prefetch={false} aria-label="rePlay, inicio"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay</Link><div className="header-buttons"><button type="button" className="logout-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => logoutDialog.current?.showModal()}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg></button></div></header>
      <div className="setup-body">
      <section className="intro" aria-labelledby="app-title">
        <h1 id="app-title">Revisa tu movimiento<br /><span>unos segundos después.</span></h1>
      </section>
      <section className="configuration" aria-label="Preparar sesión">
        <div className="settings">
          <fieldset><legend>Retraso del vídeo</legend><div className="delay-options">{DELAYS.map(seconds => <button key={seconds} type="button" aria-pressed={delay === seconds} onClick={() => saveDelay(seconds)}>{seconds}<span> s</span></button>)}</div><p className="field-help">Elige el tiempo que necesitas para acercarte a la pantalla.</p></fieldset>
          <label className="quality-label" htmlFor="quality">Calidad del vídeo</label>
          <select id="quality" value={quality} onChange={event => setQuality(Number(event.target.value) as Quality)}>{PROFILES.map((profile, index) => <option value={index} key={profile.label}>{profile.label}{index === 0 ? ' · recomendada' : ''}</option>)}</select>
          <button type="button" className="how-link" onClick={() => setGuideOpen(true)}>Cómo funciona</button>
        </div>
      </section>
      {!active && message && <div className="notice" role={state === 'error' ? 'alert' : 'status'}><p>{message}</p>{lowerQuality && quality < 2 && <button className="button secondary" onClick={() => start((quality + 1) as Quality)}>Reiniciar con menor calidad</button>}</div>}
      <div className="installation-actions"><InstallApp pwa={pwa} /></div>
      </div>
      <div className="start-bar"><button type="button" className="button secondary start-button" onClick={openClips}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>Tus clips{!!clips?.length && <span className="clips-count">{clips.length}</span>}</button><button className="button primary start-button" onClick={() => start()}><span aria-hidden="true">▶</span> Iniciar</button></div>
    </div>

    {view === 'clips' && !active && <Clips clips={clips} onBack={() => history.back()} />}
    <section className={`player ${active ? 'is-active' : ''}`} aria-label="Sesión de vídeo con retraso" aria-hidden={!active} onPointerDown={showControls} onFocus={showControls}>
      <video ref={video} muted playsInline aria-label={`Vídeo de la cámara con ${sessionDelay} segundos de retraso`} />
      {active && <>
        <div className="player-status"><span className={state === 'playing' ? 'status-dot' : 'status-dot waiting'} />{labels[state]}<span className="delay-badge">{sessionDelay} s de retraso</span></div>
        {waiting && <div className="buffer-overlay" role="status"><p>{state === 'requesting' ? 'Permite el acceso a la cámara' : state === 'recovering' ? 'Recuperando el vídeo' : 'Preparando tu vídeo con retraso'}</p><strong>{state === 'requesting' ? '…' : Math.max(0, Math.ceil(sessionDelay - progress))}<span>{state !== 'requesting' ? ' s' : ''}</span></strong><progress max={sessionDelay} value={progress} aria-label="Vídeo disponible en el búfer" /><p className="buffer-hint">{state === 'requesting' ? 'No se solicitará el micrófono.' : 'El vídeo comenzará automáticamente.'}</p></div>}
        {blocked && <div className="playback-prompt" role="alert"><p>{message}</p><button className="button primary" onClick={() => engine.current?.resumePlayback()}>Reproducir vídeo</button></div>}
        <div ref={toolbar} className={`player-controls ${controls || blocked || clipping ? '' : 'controls-hidden'}`} onBlur={showControls}>
          <div><strong>{sessionDelay} segundos después</strong><span>{actualQuality || 'Comprobando la cámara…'}{reduced ? ' · Calidad reducida' : ''}</span></div>
          <div className="player-actions">
            <button className="button clip-button" onClick={() => void saveClip()} disabled={state !== 'playing' || clipping} aria-busy={clipping} aria-label={clipping ? 'Guardando clip' : `Guardar clip de los últimos ${CLIP_SECONDS} segundos`} title={`Guardar los últimos ${CLIP_SECONDS} s`}>{clipping ? <svg className="clip-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg> : clipSaved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88" /><path d="M14.47 14.48 20 20" /><path d="M8.12 8.12 12 12" /></svg>}<span className="clip-label">{clipping ? 'Guardando…' : clipSaved ? 'Guardado' : 'Clip'}</span></button>
            <button className="button stop-button" onClick={stop}><span aria-hidden="true">■</span> Detener</button>
          </div>
        </div>
        {clipNotice && <div className="clip-notice" role="status">{clipNotice}</div>}
      </>}
    </section>
    <dialog ref={logoutDialog} className="confirm-dialog" aria-labelledby="logout-title" onClick={event => { if (event.target === event.currentTarget) logoutDialog.current?.close(); }}>
      <div className="confirm-body">
        <h2 id="logout-title">¿Cerrar sesión?</h2>
        <p>Tendrás que volver a iniciar sesión para usar rePlay.</p>
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => logoutDialog.current?.close()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
      </div>
      <form method="dialog" className="confirm-actions"><button className="button secondary" autoFocus><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>Cancelar</button><button type="button" className="button confirm-button" onClick={() => void signOut()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>Cerrar sesión</button></form>
    </dialog>
    {showOnboarding && <Onboarding pwa={pwa} delay={delay} onDelay={saveDelay} onClose={() => setGuideOpen(false)} />}
  </main>;
}

