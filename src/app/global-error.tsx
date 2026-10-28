'use client';
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import './globals.css';
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html lang="es"><body><main className="not-found"><p className="wordmark">rePlay</p><h1>Algo ha fallado.</h1><p>Vuelve a intentarlo para seguir con tu sesión.</p><button className="button primary" onClick={reset}>Reintentar</button></main></body></html>;
}
