'use client';

import { useId, useRef, useState } from 'react';

type Pwa = { canInstall: boolean; installed: boolean; installApp: () => Promise<boolean | void> };
type Guide = 'ios' | 'android' | 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';

const GUIDES: Record<Guide, { label: string; steps: string[] }> = {
  ios: { label: 'iPhone o iPad', steps: ['Abre rePlay en Safari.', 'Pulsa Compartir, el cuadrado con una flecha hacia arriba. Puede estar dentro del menú de Safari.', 'Elige «Añadir a pantalla de inicio» y confirma con «Añadir». Si aparece «Abrir como app web», déjalo activado.'] },
  android: { label: 'Android', steps: ['Abre el menú ⋮ de tu navegador.', 'Pulsa «Instalar aplicación» o «Añadir a pantalla de inicio».', 'Confirma con «Instalar» o «Añadir». Después abre rePlay desde su nuevo icono.'] },
  chrome: { label: 'Chrome en ordenador', steps: ['Pulsa el icono de instalar a la derecha de la barra de direcciones, si aparece.', 'También puedes abrir ⋮ → «Enviar, guardar y compartir» → «Instalar página como aplicación…».', 'Confirma con «Instalar». Después podrás abrir rePlay desde tus aplicaciones.'] },
  edge: { label: 'Edge en ordenador', steps: ['Abre el menú ⋯ de Edge.', 'Entra en «Aplicaciones» y elige «Instalar este sitio como una aplicación».', 'Confirma con «Instalar» y abre rePlay desde tus aplicaciones.'] },
  safari: { label: 'Safari en Mac', steps: ['Abre rePlay en Safari.', 'En el menú «Archivo», elige «Añadir al Dock».', 'Confirma con «Añadir». Abre rePlay desde el nuevo icono del Dock.'] },
  firefox: { label: 'Firefox en Android', steps: ['Abre el menú ⋮ de Firefox.', 'Pulsa «Instalar» para añadir rePlay a la pantalla de inicio.', 'Confirma con «Añadir» o «Añadir automáticamente» y abre el nuevo icono.'] },
  other: { label: 'Otro navegador', steps: ['Busca «Instalar aplicación» o «Añadir a pantalla de inicio» en el menú del navegador.', 'Si no aparece, abre esta misma página en Chrome (Android u ordenador) o Safari (iPhone, iPad o Mac).', 'Pulsa de nuevo «Instalar aplicación» y sigue los pasos.'] },
};

function detectGuide(): Guide {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return /Firefox\//i.test(ua) ? 'firefox' : 'android';
  if (/Edg\//i.test(ua)) return 'edge';
  if ('brave' in navigator || /OPR\//i.test(ua)) return 'other';
  if (/Chrome\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua) && /Mac/i.test(ua)) return 'safari';
  return 'other';
}

export function InstallApp({ pwa }: { pwa: Pwa }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [guide, setGuide] = useState<Guide>('other');
  const [installing, setInstalling] = useState(false);
  const [failed, setFailed] = useState(false);

  async function install() {
    if (installing) return;
    setFailed(false);
    setInstalling(true);
    try { if (await pwa.installApp() !== false) return; }
    catch { setFailed(true); }
    finally { setInstalling(false); }
    setGuide(detectGuide());
    dialog.current?.showModal();
  }

  return <>
    <button type="button" className="button secondary install-app-button" disabled={pwa.installed || installing} aria-busy={installing} onClick={() => void install()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3" /><path d="m7 10 5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
      {pwa.installed ? 'Aplicación instalada' : installing ? 'Abriendo instalación…' : 'Instalar aplicación'}
    </button>
    <dialog ref={dialog} className="confirm-dialog install-dialog" aria-labelledby={`${id}-title`} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="confirm-body">
        <h2 id={`${id}-title`}>Instalar rePlay</h2>
        <p>{failed ? 'No se ha podido abrir la instalación automática. Puedes instalarla desde el navegador:' : 'Añade rePlay para abrirla desde su propio icono.'}</p>
        <label htmlFor={`${id}-browser`}>Tu dispositivo o navegador</label>
        <select id={`${id}-browser`} value={guide} onChange={event => setGuide(event.target.value as Guide)}>{Object.entries(GUIDES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
        <ol>{GUIDES[guide].steps.map(step => <li key={step}>{step}</li>)}</ol>
        {guide === 'ios' && <p>En iPhone la aplicación sigue en evaluación.</p>}
      </div>
      <form method="dialog" className="confirm-actions">
        <button className="button secondary">Cerrar</button>
        {pwa.canInstall && !pwa.installed && <button type="button" className="button confirm-button" disabled={installing} onClick={() => { dialog.current?.close(); void install(); }}>Instalar ahora</button>}
      </form>
    </dialog>
  </>;
}
