'use client';

import { useEffect, useRef, useState } from 'react';

export type CoachAccess = { name: string; username: string; password: string };

export function ShareAccessDialog({ access, onClose }: { access: CoachAccess; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copyLabel = useRef<HTMLSpanElement>(null);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const message = `Hola, ${access.name}.\nYa tienes acceso a rePlay.\n\nWeb: https://replayapp.vercel.app\nUsuario: ${access.username}\nContraseña: ${access.password}\n\nGuarda estos datos para volver a entrar cuando quieras.`;

  useEffect(() => { dialog.current?.showModal(); }, []);

  useEffect(() => () => {
    clearTimeout(swapTimer.current);
    clearTimeout(resetTimer.current);
  }, []);

  function swapCopyLabel(text: string) {
    const label = copyLabel.current;
    if (!label) return;
    clearTimeout(swapTimer.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      label.classList.remove('is-exit', 'is-enter-start');
      label.textContent = text;
      return;
    }
    const duration = parseFloat(getComputedStyle(label).getPropertyValue('--text-swap-dur')) || 150;
    label.classList.add('is-exit');
    swapTimer.current = setTimeout(() => {
      label.textContent = text;
      label.classList.remove('is-exit');
      label.classList.add('is-enter-start');
      void label.offsetHeight;
      label.classList.remove('is-enter-start');
    }, duration);
  }

  async function copy() {
    setError('');
    try {
      await navigator.clipboard.writeText(message);
      if (!copyLabel.current) return;
      clearTimeout(resetTimer.current);
      swapCopyLabel('Copiado');
      resetTimer.current = setTimeout(() => swapCopyLabel('Copiar datos'), 2200);
    }
    catch {
      clearTimeout(resetTimer.current);
      swapCopyLabel('Copiar datos');
      setError('No se han podido copiar. Selecciona el mensaje y cópialo manualmente.');
    }
  }

  async function share() {
    if (!navigator.share) { await copy(); return; }
    setSharing(true); setError('');
    try { await navigator.share({ title: 'Tu acceso a rePlay', text: message }); }
    catch (failure) {
      if (!(failure instanceof Error && failure.name === 'AbortError')) setError('No se ha podido compartir. Prueba con Copiar datos.');
    }
    finally { setSharing(false); }
  }

  return <dialog ref={dialog} className="confirm-dialog coach-dialog access-dialog" aria-labelledby="access-title" onClose={onClose}>
    <div className="confirm-body coach-form">
      <h2 id="access-title">Acceso de {access.name}</h2>
      <label htmlFor="access-message">Mensaje para compartir</label>
      <textarea id="access-message" readOnly rows={9} value={message} spellCheck={false} onFocus={event => event.currentTarget.select()} />
      {error && <p className="login-error" role="alert">{error}</p>}
    </div>
    <div className="confirm-actions access-actions">
      <button type="button" className="button confirm-button" disabled={sharing} onClick={() => void share()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
        {sharing ? 'Compartiendo…' : 'Compartir acceso'}
      </button>
      <button type="button" className="button secondary access-copy" disabled={sharing} onClick={() => void copy()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
        <span ref={copyLabel} className="t-text-swap" aria-live="polite" aria-atomic="true">Copiar datos</span>
      </button>
      <button type="button" className="button secondary access-close" onClick={() => dialog.current?.close()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
        Cerrar
      </button>
    </div>
  </dialog>;
}
