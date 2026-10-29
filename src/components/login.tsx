'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useSignIn } from '@clerk/react';
import { isClerkAPIResponseError } from '@clerk/react/errors';

const WRONG_CREDENTIALS = ['form_identifier_not_found', 'form_password_incorrect', 'form_param_format_invalid'];

export function Login({ title = 'Inicia sesión' }: { title?: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signIn || submitting) return;
    setSubmitting(true); setError('');
    try {
      const result = await signIn.password({ identifier: username.trim().toLowerCase(), password });
      if (!result.error && signIn.status === 'complete') {
        const finalized = await signIn.finalize();
        if (!finalized.error) return;
      }
      const code = isClerkAPIResponseError(result.error) ? result.error.errors[0]?.code : undefined;
      setError(code && WRONG_CREDENTIALS.includes(code) ? 'Usuario o contraseña incorrectos.' : code === 'user_locked' ? 'Demasiados intentos. Vuelve a probar más tarde.' : 'No se ha podido iniciar sesión. Inténtalo de nuevo.');
      setPassword('');
    } catch { setError('No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.'); }
    finally { setSubmitting(false); }
  }

  return <main className="login">
    <form className="login-card" onSubmit={submit}>
      <div className="wordmark"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay</div>
      <h1>{title}</h1>
      <label htmlFor="username">Usuario</label>
      <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event => { setUsername(event.target.value); setError(''); }} />
      <label htmlFor="password">Contraseña</label>
      <div className="password-field">
        <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} />
        <button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(show => !show)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{showPassword
            ? <><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" /></>
            : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
        </button>
      </div>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="login-button" disabled={!signIn || submitting || fetchStatus === 'fetching'} aria-busy={submitting}>{submitting ? 'Entrando…' : 'Entrar'}</button>
    </form>
  </main>;
}
