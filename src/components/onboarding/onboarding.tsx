'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DELAYS, type DelaySeconds } from '@/lib/video/policy';
import { SportBall, type Sport } from './sport-ball';

export const ONBOARDING_KEY = 'voley-delay:onboarding:v1';
function readSeen() { try { return localStorage.getItem(ONBOARDING_KEY) !== null; } catch { return true; } }
function subscribeSeen(callback: () => void) { window.addEventListener('storage', callback); window.addEventListener('onboarding-seen', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('onboarding-seen', callback); }; }
function markSeen() { try { localStorage.setItem(ONBOARDING_KEY, new Date().toISOString()); } catch {} delete document.documentElement.dataset.onboarding; window.dispatchEvent(new Event('onboarding-seen')); }
export function useOnboardingSeen() { return useSyncExternalStore(subscribeSeen, readSeen, () => true); }

type Item = { sport: Sport; title: string; description: string };
type Step = { id: 'hello' | 'idea' | 'sports' | 'how' | 'delay' | 'privacy' | 'install' | 'ready'; sport: Sport; title: string; description: string; items?: Item[]; bunch?: boolean };

const STEPS: Step[] = [
  { id: 'hello', sport: 'volleyball', title: '¡Hola! Soy rePlay', description: 'Tu repetición instantánea para entrenar. Te enseño cómo funciono en menos de un minuto.' },
  { id: 'idea', sport: 'football', title: 'Juega primero. Mírate después.', description: 'El móvil te graba y la pantalla te enseña lo que acabas de hacer unos segundos más tarde, sin parar el entrenamiento ni tocar nada.' },
  { id: 'sports', sport: 'basketball', title: 'Para cualquier deporte', description: 'Fútbol, vóley, baloncesto, tenis, pádel, gimnasia… Si te mueves, puedes revisarlo.', bunch: true },
  { id: 'how', sport: 'tennis', title: 'Así se usa', description: 'Cuatro pasos y a entrenar.', items: [
    { sport: 'volleyball', title: '1. Coloca el móvil', description: 'En un trípode o apoyado, apuntando a donde entrenas. Mejor en horizontal.' },
    { sport: 'football', title: '2. Elige el retraso', description: 'Los segundos que tardas en acercarte a mirar.' },
    { sport: 'basketball', title: '3. Pulsa «Iniciar»', description: 'La cámara solo se abre cuando tú lo pides.' },
    { sport: 'tennis', title: '4. Entrena y mira', description: 'Haz el ejercicio, ve a la pantalla y corrige en la siguiente repetición.' },
  ] },
  { id: 'delay', sport: 'football', title: '¿Cuánto tardas en llegar a la pantalla?', description: 'Elige un retraso. Podrás cambiarlo siempre antes de empezar.' },
  { id: 'privacy', sport: 'volleyball', title: 'Tu vídeo no sale del móvil', description: 'Todo ocurre en este dispositivo y desaparece al terminar.', items: [
    { sport: 'tennis', title: 'Sin micrófono', description: 'Solo se usa la cámara, nunca el audio.' },
    { sport: 'basketball', title: 'Solo guardas lo que quieras', description: 'Nada va a servidores. Al detener se borra todo salvo los clips que guardes, que se quedan en este móvil.' },
    { sport: 'football', title: 'Sin cuentas', description: 'Ábrela y úsala. No hace falta registrarse.' },
  ] },
  { id: 'install', sport: 'basketball', title: 'Añade rePlay a tu inicio', description: 'Ábrela desde el icono de tu móvil cuando vayas a entrenar.' },
  { id: 'ready', sport: 'volleyball', title: '¡A entrenar!', description: 'Coloca el móvil, pulsa «Iniciar» y sigue jugando. Tu repetición te espera.', bunch: true },
];

const DELAY_HINTS: Record<DelaySeconds, string> = { 5: 'Estás justo al lado del móvil', 10: 'A unos pasos · el más habitual', 15: 'Al otro lado de la pista', 20: 'Ejercicios con desplazamiento', 30: 'Jugadas largas o campo grande' };
const BUNCH: Sport[] = ['football', 'volleyball', 'basketball', 'tennis'];

type Pwa = { canInstall: boolean; installed: boolean; offlineReady: boolean; installApp: () => Promise<void> };
type Props = { pwa: Pwa; delay: DelaySeconds; onDelay: (value: DelaySeconds) => void; onClose: () => void };

function platform() {
  if (typeof navigator === 'undefined') return 'other';
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(agent) ? 'android' : 'other';
}

export function Onboarding({ pwa, delay, onDelay, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [os] = useState(platform);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const hero = !step.items && !step.bunch && step.id !== 'delay' && step.id !== 'install';
  const installAvailable = step.id === 'install' && pwa.canInstall && !pwa.installed;

  useEffect(() => { if (index > 0) heading.current?.focus(); }, [index]);
  useEffect(() => { document.body.classList.add('onboarding-open'); return () => document.body.classList.remove('onboarding-open'); }, []);

  function finish() { markSeen(); onClose(); }
  function next() { if (last) finish(); else setIndex(index + 1); }
  async function install() { await pwa.installApp(); next(); }

  return <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="ob-frame">
      <header className="ob-top">
        <button type="button" className={`ob-icon ${index > 0 ? '' : 'ob-invisible'}`} aria-label="Atrás" disabled={index === 0} onClick={() => setIndex(index - 1)}>←</button>
        <div className="ob-progress" role="progressbar" aria-label="Progreso de la bienvenida" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(((index + 1) / STEPS.length) * 100)}><span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
        <button type="button" className={`ob-icon ${last ? 'ob-invisible' : ''}`} aria-label="Cerrar la bienvenida" disabled={last} onClick={finish}>✕</button>
      </header>

      <div className="ob-step" key={step.id}>
        <div className={hero ? 'ob-mascot ob-hero' : 'ob-mascot'}>
          <SportBall sport={step.sport} className="ob-ball" />
          <div className="ob-bubble">
            <h2 id="onboarding-title" ref={heading} tabIndex={-1}>{step.title}</h2>
            <p>{step.description}</p>
          </div>
        </div>

        {step.id === 'idea' && <div className="ob-timeline" aria-hidden="true">
          <div className="ob-scene"><span className="ob-scene-label">Ahora</span><SportBall sport="football" className="ob-kick" /><span className="ob-scene-caption">Haces el ejercicio</span></div>
          <div className="ob-arrow"><strong>{delay} s</strong><span>→</span></div>
          <div className="ob-scene ob-screen"><span className="ob-scene-label">En pantalla</span><SportBall sport="football" className="ob-kick ob-kick-late" /><span className="ob-scene-caption">Lo ves y corriges</span></div>
        </div>}

        {step.bunch && <div className="ob-bunch" aria-hidden="true">{BUNCH.map(sport => <SportBall key={sport} sport={sport} className={`ob-bunch-ball ob-${sport}`} />)}</div>}

        {step.items && <ul className="ob-list">{step.items.map(item => <li key={item.title}><SportBall sport={item.sport} className="ob-list-ball" /><div><p className="ob-list-title">{item.title}</p><p>{item.description}</p></div></li>)}</ul>}

        {step.id === 'delay' && <div className="ob-delays" role="radiogroup" aria-label="Retraso">{DELAYS.map(seconds => <button type="button" role="radio" aria-checked={delay === seconds} key={seconds} onClick={() => onDelay(seconds)}><strong>{seconds} s</strong><span>{DELAY_HINTS[seconds]}</span></button>)}</div>}

        {step.id === 'install' && <InstallGuide os={os} pwa={pwa} />}
      </div>

      <div className="ob-footer">
        {installAvailable
          ? <button type="button" className="ob-cta" onClick={() => void install()}>Instalar rePlay</button>
          : <button type="button" className="ob-cta" onClick={next}>{last ? 'Empezar' : step.id === 'install' && !pwa.installed ? 'Ya la he instalado' : 'Continuar'}</button>}
        {step.id === 'install' && !pwa.installed && <button type="button" className="ob-later" onClick={next}>Por el momento no</button>}
      </div>
    </div>
  </div>;
}

function InstallGuide({ os, pwa }: { os: string; pwa: Pwa }) {
  if (pwa.installed) return <p className="ob-installed">✓ rePlay ya está instalada en este dispositivo.</p>;
  const steps = os === 'ios'
    ? ['Abre esta página en Safari.', 'Pulsa el botón Compartir (el cuadrado con la flecha hacia arriba).', 'Elige «Añadir a pantalla de inicio» y confirma con «Añadir».']
    : pwa.canInstall
      ? ['Pulsa «Instalar rePlay» aquí abajo.', 'Confirma la instalación en el aviso del navegador.', 'Ábrela desde el icono de tu pantalla de inicio.']
      : ['Abre esta página en Chrome.', 'Pulsa el menú ⋮ de arriba a la derecha.', 'Elige «Instalar aplicación» o «Añadir a pantalla de inicio».'];
  return <div className="ob-install">
    <ol className="ob-install-steps">{steps.map(text => <li key={text}>{text}</li>)}</ol>
    {os === 'ios' && <p className="ob-note">En iPhone la aplicación sigue en evaluación.</p>}
  </div>;
}
