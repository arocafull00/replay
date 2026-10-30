'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useSignIn } from '@clerk/react';
import { isClerkAPIResponseError } from '@clerk/react/errors';

const WRONG_CREDENTIALS = ['form_identifier_not_found', 'form_password_incorrect', 'form_param_format_invalid'];
const RESET_ERRORS: Record<string, string> = {
  form_identifier_not_found: 'No hay ninguna cuenta con ese usuario o correo.',
  form_code_incorrect: 'El código no es correcto. Revísalo e inténtalo de nuevo.',
  verification_expired: 'El código ha caducado. Pide uno nuevo.',
  verification_failed: 'Demasiados intentos con ese código. Pide uno nuevo.',
  too_many_requests: 'Demasiados intentos. Vuelve a probar más tarde.',
  user_locked: 'Demasiados intentos. Vuelve a probar más tarde.',
  form_password_pwned: 'Esa contraseña aparece en filtraciones conocidas. Elige otra.',
  form_password_length_too_short: 'La contraseña debe tener al menos 8 caracteres.',
  form_password_not_strong_enough: 'La contraseña es demasiado débil.',
};
const NO_EMAIL = 'Esta cuenta no tiene correo para recuperar la contraseña. Pide una nueva a quien te dio el acceso.';

type Step = 'login' | 'identify' | 'code' | 'password';

function errorCode(error: unknown) { return isClerkAPIResponseError(error) ? error.errors[0]?.code : undefined; }

function PasswordInput({ id, autoComplete, value, onChange }: { id: string; autoComplete: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-field">
    <input id={id} name={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 8 : undefined} value={value} onChange={event => onChange(event.target.value)} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(show => !show)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{visible
        ? <><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" /></>
        : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
    </button>
  </div>;
}

export function Login({ title = 'Inicia sesión' }: { title?: string }) {
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function go(next: Step) { setStep(next); setError(''); setNotice(''); setPassword(''); setCode(''); }

  async function run(action: () => Promise<void>) {
    if (!signIn || submitting) return;
    setSubmitting(true); setError('');
    try { await action(); }
    catch { setError('No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.'); }
    finally { setSubmitting(false); }
  }

  const login = () => run(async () => {
    const result = await signIn.password({ identifier: username.trim().toLowerCase(), password });
    if (!result.error && signIn.status === 'complete') {
      const finalized = await signIn.finalize();
      if (!finalized.error) return;
    }
    const failure = errorCode(result.error);
    setError(failure && WRONG_CREDENTIALS.includes(failure) ? 'Usuario o contraseña incorrectos.' : failure === 'user_locked' ? 'Demasiados intentos. Vuelve a probar más tarde.' : 'No se ha podido iniciar sesión. Inténtalo de nuevo.');
    setPassword('');
  });

  const sendCode = () => run(async () => {
    const created = await signIn.create({ identifier: username.trim().toLowerCase() });
    if (created.error) { setError(RESET_ERRORS[errorCode(created.error) ?? ''] ?? 'No se ha podido enviar el código. Inténtalo de nuevo.'); return; }
    const factor = signIn.supportedFirstFactors.find(item => item.strategy === 'reset_password_email_code');
    if (!factor) { setError(NO_EMAIL); return; }
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) { setError(RESET_ERRORS[errorCode(sent.error) ?? ''] ?? NO_EMAIL); return; }
    setSentTo('safeIdentifier' in factor ? factor.safeIdentifier : '');
    if (step === 'code') { setCode(''); setNotice('Te hemos enviado un código nuevo.'); }
    else go('code');
  });

  const verifyCode = () => run(async () => {
    const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (result.error || signIn.status !== 'needs_new_password') { setError(RESET_ERRORS[errorCode(result.error) ?? ''] ?? 'No se ha podido comprobar el código. Inténtalo de nuevo.'); return; }
    go('password');
  });

  const savePassword = () => run(async () => {
    const result = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
    if (!result.error && signIn.status === 'complete') {
      const finalized = await signIn.finalize();
      if (!finalized.error) return;
    }
    setError(RESET_ERRORS[errorCode(result.error) ?? ''] ?? 'No se ha podido guardar la contraseña. Inténtalo de nuevo.');
  });

  function back() { void signIn?.reset(); go('login'); }

  function submit(event: FormEvent) {
    event.preventDefault();
    void { login, identify: sendCode, code: verifyCode, password: savePassword }[step]();
  }

  const busy = !signIn || submitting || fetchStatus === 'fetching';
  const heading = { login: title, identify: 'Recupera tu contraseña', code: 'Revisa tu correo', password: 'Nueva contraseña' }[step];
  const label = { login: ['Entrar', 'Entrando…'], identify: ['Enviar código', 'Enviando…'], code: ['Comprobar código', 'Comprobando…'], password: ['Guardar y entrar', 'Guardando…'] }[step];

  return <main className="login">
    <form className="login-card" onSubmit={submit}>
      <div className="wordmark"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay</div>
      <h1>{heading}</h1>
      {step === 'identify' && <p className="login-help">Te enviaremos un código al correo de tu cuenta.</p>}
      {step === 'code' && <p className="login-help">{sentTo ? `Hemos enviado un código a ${sentTo}.` : 'Te hemos enviado un código por correo.'} Si no lo ves, mira en spam.</p>}
      {step === 'password' && <p className="login-help">Elige una contraseña de al menos 8 caracteres.</p>}
      {(step === 'login' || step === 'identify') && <>
        <label htmlFor="username">{step === 'login' ? 'Usuario' : 'Usuario o correo'}</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={username} onChange={event => { setUsername(event.target.value); setError(''); }} />
      </>}
      {step === 'login' && <>
        <label htmlFor="password">Contraseña</label>
        <PasswordInput id="password" autoComplete="current-password" value={password} onChange={value => { setPassword(value); setError(''); }} />
      </>}
      {step === 'code' && <>
        <label htmlFor="code">Código</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => { setCode(event.target.value.replace(/\D/g, '')); setError(''); setNotice(''); }} />
      </>}
      {step === 'password' && <>
        <label htmlFor="new-password">Nueva contraseña</label>
        <PasswordInput id="new-password" autoComplete="new-password" value={password} onChange={value => { setPassword(value); setError(''); }} />
      </>}
      {error && <p className="login-error" role="alert">{error}</p>}
      {notice && <p className="login-help" role="status">{notice}</p>}
      <button type="submit" className="login-button" disabled={busy} aria-busy={submitting}>{submitting ? label[1] : label[0]}</button>
      {step === 'login'
        ? <button type="button" className="login-link" onClick={() => go('identify')}>¿Has olvidado tu contraseña?</button>
        : <div className="login-links">
          {step === 'code' && <button type="button" className="login-link" disabled={busy} onClick={() => void sendCode()}>Reenviar código</button>}
          <button type="button" className="login-link" onClick={back}>Volver a iniciar sesión</button>
        </div>}
    </form>
  </main>;
}
