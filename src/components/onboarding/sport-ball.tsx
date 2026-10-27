import { useId } from 'react';

export type Sport = 'volleyball' | 'football' | 'basketball' | 'tennis';

function pentagon(cx: number, cy: number, r: number, rotation: number) {
  return Array.from({ length: 5 }, (_, k) => {
    const angle = ((rotation + 72 * k - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}
function polar(r: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return [50 + r * Math.cos(angle), 50 + r * Math.sin(angle)].map(value => value.toFixed(1));
}

const INK = 'oklch(.22 0 0)';
const SEAMS = [-90, -18, 54, 126, 198];
const PATCHES = [-54, 18, 90, 162, 234];

function Football() {
  return <>
    <circle cx="50" cy="50" r="46" fill="white" />
    <polygon points={pentagon(50, 50, 15, 0)} fill={INK} />
    {SEAMS.map(degrees => { const [x1, y1] = polar(15, degrees); const [x2, y2] = polar(46, degrees); return <line key={degrees} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth="2.5" />; })}
    {PATCHES.map(degrees => { const [cx, cy] = polar(47, degrees); return <polygon key={degrees} points={pentagon(Number(cx), Number(cy), 14, degrees + 90)} fill={INK} />; })}
  </>;
}
function Volleyball() {
  return <>
    <circle cx="50" cy="50" r="46" fill="oklch(.92 .13 95)" />
    {[0, 120, 240].map(rotation => <g key={rotation} transform={`rotate(${rotation} 50 50)`} fill="none" strokeLinecap="round">
      <path d="M50 50 C 47 31 56 15 74 6" stroke="oklch(.45 .15 255)" strokeWidth="3.5" />
      <path d="M36 42 C 34 26 42 12 56 3" stroke="oklch(.45 .15 255)" strokeWidth="3.5" />
      <path d="M50 50 C 47 31 56 15 74 6 L 96 30 C 80 34 64 42 50 50 Z" fill="oklch(.55 .16 255)" stroke="none" />
    </g>)}
  </>;
}
function Basketball() {
  return <>
    <circle cx="50" cy="50" r="46" fill="oklch(.68 .17 50)" />
    <g fill="none" stroke="oklch(.25 .04 50)" strokeWidth="3" strokeLinecap="round">
      <path d="M50 4v92M4 50h92M19 16c18 18 18 50 0 68M81 16c-18 18-18 50 0 68" />
    </g>
  </>;
}
function Tennis() {
  return <>
    <circle cx="50" cy="50" r="46" fill="oklch(.9 .19 118)" />
    <g fill="none" stroke="white" strokeWidth="5" strokeLinecap="round">
      <path d="M12 24c22 12 26 40 0 54M88 22c-26 14-22 42 0 54" />
    </g>
  </>;
}
const SHAPES: Record<Sport, () => React.JSX.Element> = { volleyball: Volleyball, football: Football, basketball: Basketball, tennis: Tennis };

export function SportBall({ sport, className }: { sport: Sport; className?: string }) {
  const clip = useId();
  const Shape = SHAPES[sport];
  return <svg className={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <clipPath id={clip}><circle cx="50" cy="50" r="46" /></clipPath>
    <g clipPath={`url(#${clip})`}><Shape /><circle cx="36" cy="30" r="22" fill="white" opacity=".18" /></g>
    <circle cx="50" cy="50" r="46" fill="none" stroke={INK} strokeWidth="3" />
  </svg>;
}
