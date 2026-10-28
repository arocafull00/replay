'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { clipFileName, deleteClip, type Clip } from '@/lib/clips';
import { CLIP_SECONDS } from '@/lib/video/policy';

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

export function Clips({ clips, onBack }: { clips: Clip[] | null; onBack: () => void }) {
  const [pending, setPending] = useState<Clip | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  function ask(clip: Clip) { setPending(clip); dialog.current?.showModal(); }
  async function remove() {
    dialog.current?.close();
    if (!pending) return;
    try { await deleteClip(pending.id); } catch { setError('No se pudo borrar el clip.'); }
  }

  return <div className="clips">
    <header className="app-header clips-header">
      <button type="button" className="icon-button" aria-label="Volver" title="Volver" onClick={onBack}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg></button>
      <h2 id="clips-title">Tus clips</h2>
    </header>
    {error && <div className="notice" role="alert"><p>{error}</p></div>}
    {clips?.length === 0 && <div className="clips-empty"><p>Todavía no tienes clips.</p><p>Pulsa «Clip» durante una sesión para guardar los últimos {CLIP_SECONDS} s.</p></div>}
    {!!clips?.length && <ul className="clips-list" aria-labelledby="clips-title">{clips.map(clip => <ClipCard key={clip.id} clip={clip} onDelete={() => ask(clip)} onError={setError} />)}</ul>}
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="confirm-body">
        <h2 id="delete-title">¿Borrar este clip?</h2>
        <p>Se eliminará de este dispositivo y no se podrá recuperar.</p>
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => dialog.current?.close()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
      </div>
      <form method="dialog" className="confirm-actions"><button className="button secondary" autoFocus>Cancelar</button><button type="button" className="button confirm-button" onClick={() => void remove()}><TrashIcon />Borrar</button></form>
    </dialog>
  </div>;
}

function ClipCard({ clip, onDelete, onError }: { clip: Clip; onDelete: () => void; onError: (message: string) => void }) {
  const file = useMemo(() => new File([clip.blob], clipFileName(clip.createdAt), { type: 'video/mp4' }), [clip]);
  const shareable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const player = useCallback((node: HTMLVideoElement | null) => {
    if (!node) return;
    const url = URL.createObjectURL(clip.blob);
    node.src = `${url}#t=0.1`;
    return () => URL.revokeObjectURL(url);
  }, [clip.blob]);
  function download() {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function share() {
    try { await navigator.share({ files: [file], title: 'Clip de rePlay' }); }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) onError('No se pudo compartir el clip.'); }
  }

  return <li className="clip-card">
    <video controls playsInline preload="metadata" aria-label={`Clip del ${dateFormat.format(clip.createdAt)}`} ref={player} />
    <div className="clip-meta"><strong>{dateFormat.format(clip.createdAt)}</strong><span>{Math.round(clip.duration)} s · {(clip.size / 1024 / 1024).toFixed(1)} MB</span></div>
    <div className="clip-actions">
      <button type="button" className="button clip-button" onClick={download}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>Descargar</button>
      {shareable && <button type="button" className="button secondary" onClick={() => void share()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98" /><path d="m15.41 6.51-6.82 3.98" /></svg>Compartir</button>}
      <button type="button" className="button secondary icon-only" aria-label="Borrar clip" title="Borrar clip" onClick={onDelete}><TrashIcon /></button>
    </div>
  </li>;
}

function TrashIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}
