import Link from 'next/link';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Página no encontrada', description: 'Vuelve a rePlay para iniciar una sesión de vídeo con retraso.', alternates: { canonical: null } };
export default function NotFound() { return <main className="not-found"><p className="wordmark">rePlay</p><h1>No encontramos esta página.</h1><p>Vuelve a la aplicación para preparar tu siguiente sesión.</p><Link className="button primary" href="/">Volver a la aplicación</Link></main>; }
