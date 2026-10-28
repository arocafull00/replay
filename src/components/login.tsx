'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useSignIn } from '@clerk/react';
import { isClerkAPIResponseError } from '@clerk/react/errors';

const WRONG_CREDENTIALS = ['form_identifier_not_found', 'form_password_incorrect', 'form_param_format_invalid'];

export function Login() {
  const { signIn, fetchStatus } = useSignIn();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!signIn) return;
    const result = await signIn.password({ identifier: username.trim().toLowerCase(), password });
    if (!result.error && signIn.status === 'complete') { await signIn.finalize(); return; }
    const code = isClerkAPIResponseError(result.error) ? result.error.errors[0]?.code : undefined;
    setError(code && WRONG_CREDENTIALS.includes(code) ? 'Usuario o contraseña incorrectos.' : code === 'user_locked' ? 'Demasiados intentos. Vuelve a probar más tarde.' : 'No se ha podido iniciar sesión. Inténtalo de nuevo.');
    setPassword('');
  }

  return <main className="login">
    <form className="login-card" onSubmit={submit}>
      <div className="wordmark"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay</div>
      <h1>Inicia sesión</h1>
      <label htmlFor="username">Usuario</label>
      <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event => { setUsername(event.target.value); setError(''); }} />
      <label htmlFor="password">Contraseña</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" className="login-button" disabled={!signIn || fetchStatus === 'fetching'}>Entrar</button>
    </form>
  </main>;
}
