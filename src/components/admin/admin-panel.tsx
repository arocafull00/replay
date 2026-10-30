'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@clerk/react';
import { ApiError, useApi } from '@/lib/api';
import { useAppSignOut } from '@/lib/auth';
import { ADMIN_CACHE_KEY, readSession } from '@/lib/auth-cache';
import { usePwa } from '@/lib/use-pwa';
import { InstallApp } from '@/components/install-app';
import { ShareAccessDialog, type CoachAccess } from './share-access-dialog';

type Coach = { id: string; name: string; username: string; email: string; createdAt: number; lastSignInAt: number | null; lastUsedAt: number | null; banned: boolean; clips: number; sessions: number };
type Day = { day: string; clips: number; sessions: number; opens: number };
type Stats = { totals: { clips: number; sessions: number; opens: number; active: number }; days: Day[] };
type Data = { users?: Coach[]; stats?: Stats };
type Metric = 'clips' | 'sessions' | 'opens';
type CoachDraft = { name: string; email: string };
type Editing = { coach: Coach | null; draft?: CoachDraft; error?: string } | null;

const METRICS: { key: Metric; label: string }[] = [{ key: 'clips', label: 'Clips' }, { key: 'sessions', label: 'Sesiones' }, { key: 'opens', label: 'Aperturas' }];
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });
const dayFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const number = new Intl.NumberFormat('es');

function readCache(): Data { try { const cache = JSON.parse(localStorage.getItem(ADMIN_CACHE_KEY) ?? '{}'); const session = readSession(); return session?.role === 'admin' && cache.ownerId === session.userId ? cache.data ?? {} : {}; } catch { return {}; } }
function writeCache(data: Data, ownerId: string) { try { localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({ ownerId, data })); } catch {} }
function lastSeen(coach: Coach) { const time = Math.max(coach.lastUsedAt ?? 0, coach.lastSignInAt ?? 0); return time ? dateFormat.format(time) : 'Nunca'; }
function dayLabel(day: string) { return dayFormat.format(new Date(`${day}T12:00:00`)); }

export function AdminPanel() {
  const pwa = usePwa(false);
  const api = useApi();
  const signOut = useAppSignOut();
  const { userId } = useAuth();
  const [data, setData] = useState<Data>(readCache);
  const [tab, setTab] = useState<'coaches' | 'stats'>('coaches');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Editing>(null);
  const [removing, setRemoving] = useState<Coach | null>(null);
  const [pendingBans, setPendingBans] = useState<Record<string, boolean>>({});
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(() => new Set());
  const [pendingCreations, setPendingCreations] = useState<Coach[]>([]);
  const [failedCreation, setFailedCreation] = useState<Editing>(null);
  const [access, setAccess] = useState<CoachAccess | null>(null);
  const mutationVersion = useRef(0);
  const logoutDialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);

  const [version, setVersion] = useState(0);
  const refresh = () => { setLoading(true); setVersion(value => value + 1); };
  const load = useCallback(() => Promise.all([api<{ users: Coach[] }>('/api/admin/users'), api<Stats>('/api/admin/stats')]).then(([{ users }, stats]) => ({ users, stats })), [api]);
  useEffect(() => {
    let current = true;
    const startedAt = mutationVersion.current;
    if (!userId) return;
    load().then(next => { if (current && startedAt === mutationVersion.current) { setData(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setError(''); } }, failure => {
      if (!current || startedAt !== mutationVersion.current) return;
      if (failure instanceof ApiError && failure.status === 401) { void signOut(); return; }
      if (failure instanceof ApiError && failure.status === 403) { setData({}); try { localStorage.removeItem(ADMIN_CACHE_KEY); } catch {} }
      setError(failure instanceof Error ? failure.message : 'No se han podido cargar los datos.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [load, signOut, version, userId]);
  useEffect(() => {
    const session = readSession();
    if (userId && session?.role === 'admin' && session.userId === userId) {
      writeCache({ ...data, users: data.users?.filter(coach => !pendingRemovals.has(coach.id)) }, userId);
    }
  }, [data, pendingRemovals, userId]);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== 'hidden') setVersion(value => value + 1); };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); window.removeEventListener('online', update); document.removeEventListener('visibilitychange', update); };
  }, []);

  async function toggleBan(coach: Coach) {
    if (coach.id in pendingBans) return;
    const banned = !coach.banned;
    mutationVersion.current += 1;
    setPendingBans(previous => ({ ...previous, [coach.id]: banned }));
    setError('');
    try {
      await api('/api/admin/users', 'PATCH', { id: coach.id, banned });
      setData(previous => ({ ...previous, users: previous.users?.map(user => user.id === coach.id ? { ...user, banned } : user) }));
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido guardar.'); }
    finally {
      // Reads started before the save settled must not restore the old button state.
      mutationVersion.current += 1;
      setPendingBans(previous => { const next = { ...previous }; delete next[coach.id]; return next; });
      setVersion(value => value + 1);
    }
  }
  async function create(draft: CoachDraft) {
    const optimistic: Coach = { id: `pending-${crypto.randomUUID()}`, name: draft.name.trim(), username: '', email: draft.email.trim().toLowerCase(), createdAt: Date.now(), lastSignInAt: null, lastUsedAt: null, banned: false, clips: 0, sessions: 0 };
    mutationVersion.current += 1;
    setError('');
    setFailedCreation(null);
    setPendingCreations(previous => [...previous, optimistic]);
    setEditing(null);
    try {
      const { id, username, password } = await api<{ id: string; username: string; password: string }>('/api/admin/users', 'POST', { name: draft.name, ...(draft.email.trim() && { email: draft.email }) });
      setData(previous => ({ ...previous, users: previous.users?.some(coach => coach.id === id) ? previous.users : [...(previous.users ?? []), { ...optimistic, id, username }] }));
      setAccess({ name: optimistic.name, username, password });
      setVersion(value => value + 1);
    }
    catch (failure) {
      const message = failure instanceof Error ? failure.message : 'No se ha podido crear el entrenador.';
      setError(message);
      setFailedCreation({ coach: null, draft, error: message });
    }
    finally {
      mutationVersion.current += 1;
      setPendingCreations(previous => previous.filter(coach => coach.id !== optimistic.id));
    }
  }
  function askRemove(coach: Coach) { setRemoving(coach); removeDialog.current?.showModal(); }
  async function remove() {
    if (!removing || pendingRemovals.has(removing.id)) return;
    const coach = removing;
    mutationVersion.current += 1;
    setError('');
    setPendingRemovals(previous => new Set(previous).add(coach.id));
    removeDialog.current?.close();
    setRemoving(null);
    try {
      await api(`/api/admin/users?id=${encodeURIComponent(coach.id)}`, 'DELETE');
      setData(previous => ({ ...previous, users: previous.users?.filter(user => user.id !== coach.id) }));
      setVersion(value => value + 1);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido borrar.'); }
    finally {
      // Ignore reads started before this deletion settled, which may still contain the coach.
      mutationVersion.current += 1;
      setPendingRemovals(previous => { const next = new Set(previous); next.delete(coach.id); return next; });
    }
  }

  const users = data.users || pendingCreations.length ? [
    ...(data.users ?? []).filter(coach => !pendingRemovals.has(coach.id)).map(coach => coach.id in pendingBans ? { ...coach, banned: pendingBans[coach.id] } : coach),
    ...pendingCreations,
  ] : undefined;
  return <main className="admin">
    <header className="app-header">
      <Link className="wordmark" href="/admin" prefetch={false} aria-label="rePlay, panel de administración"><Image src="/mark.png?v=athlete-1" width={36} height={36} alt="" unoptimized />rePlay<span className="admin-tag">Admin</span></Link>
      <div className="header-buttons"><button type="button" className="logout-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={() => logoutDialog.current?.showModal()}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg></button></div>
    </header>
    <div className="admin-toolbar"><div className="admin-tabs" role="group" aria-label="Secciones">
      <button type="button" aria-pressed={tab === 'coaches'} onClick={() => setTab('coaches')}>Entrenadores{users && <span className="clips-count">{users.length}</span>}</button>
      <button type="button" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>Analíticas</button>
    </div>
      <InstallApp pwa={pwa} />
    </div>
    {(error || failedCreation) && <div className="notice" role="alert"><p>{error || failedCreation?.error}</p><button type="button" className="button secondary" onClick={failedCreation ? () => { setEditing(failedCreation); setFailedCreation(null); setError(''); } : refresh}>{failedCreation ? 'Revisar datos' : 'Reintentar'}</button></div>}
    {tab === 'coaches'
      ? <section aria-labelledby="coaches-title">
        <div className="admin-section-head"><h1 id="coaches-title">Entrenadores</h1><button type="button" className="admin-button" disabled={pendingCreations.length > 0} onClick={() => setEditing({ coach: null })}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>Nuevo entrenador</button></div>
        {!users && loading && <p className="admin-empty">Cargando…</p>}
        {users?.length === 0 && <div className="clips-empty"><p>Todavía no hay entrenadores.</p><p>Crea uno para que pueda entrar en rePlay.</p></div>}
        {!!users?.length && <ul className="coach-list">{users.map(coach => <li key={coach.id} className={`coach-card ${coach.banned ? 'is-banned' : ''}`}>
          <div className="coach-main"><strong>{coach.name || coach.username || 'Sin nombre'}</strong></div>
          <div className="coach-actions">
            <button type="button" className="button secondary" disabled={coach.id in pendingBans || pendingCreations.some(pending => pending.id === coach.id)} onClick={() => setEditing({ coach })}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></svg>
              Editar
            </button>
            <button type="button" className="button secondary" disabled={coach.id in pendingBans || pendingCreations.some(pending => pending.id === coach.id)} aria-busy={coach.id in pendingBans} onClick={() => void toggleBan(coach)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{coach.banned ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>}</svg>
              {coach.banned ? 'Reactivar' : 'Desactivar'}
            </button>
            <button type="button" className="button secondary danger" disabled={coach.id in pendingBans || pendingCreations.some(pending => pending.id === coach.id)} onClick={() => askRemove(coach)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
              Borrar
            </button>
          </div>
        </li>)}</ul>}
      </section>
      : <Analytics stats={data.stats} users={users} loading={loading} />}

    {editing && <CoachDialog key={editing.coach?.id ?? 'new'} coach={editing.coach} draft={editing.draft} initialError={editing.error} onCreate={draft => void create(draft)} onClose={() => setEditing(null)} onSaved={nextAccess => { setEditing(null); if (nextAccess) setAccess(nextAccess); refresh(); }} />}
    {access && <ShareAccessDialog access={access} onClose={() => setAccess(null)} />}
    <dialog ref={removeDialog} className="confirm-dialog" aria-labelledby="remove-title" onClick={event => { if (event.target === event.currentTarget) removeDialog.current?.close(); }}>
      <div className="confirm-body">
        <h2 id="remove-title">¿Borrar a {removing?.name || removing?.username}?</h2>
        <p>No podrá volver a entrar en rePlay. Sus clips siguen en su móvil y sus datos de uso se conservan en las analíticas.</p>
        {error && <p className="login-error" role="alert">{error}</p>}
      </div>
      <form method="dialog" className="confirm-actions"><button className="button secondary" autoFocus>Cancelar</button><button type="button" className="button confirm-button danger-confirm" onClick={() => void remove()}>Borrar entrenador</button></form>
    </dialog>
    <dialog ref={logoutDialog} className="confirm-dialog" aria-labelledby="logout-title" onClick={event => { if (event.target === event.currentTarget) logoutDialog.current?.close(); }}>
      <div className="confirm-body"><h2 id="logout-title">¿Cerrar sesión?</h2><p>Tendrás que volver a iniciar sesión para entrar en el panel.</p></div>
      <form method="dialog" className="confirm-actions"><button className="button secondary" autoFocus>Cancelar</button><button type="button" className="button confirm-button" onClick={() => void signOut()}>Cerrar sesión</button></form>
    </dialog>
  </main>;
}

function CoachDialog({ coach, draft, initialError = '', onCreate, onClose, onSaved }: { coach: Coach | null; draft?: CoachDraft; initialError?: string; onCreate: (draft: CoachDraft) => void; onClose: () => void; onSaved: (access?: CoachAccess) => void }) {
  const api = useApi();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(coach?.name ?? draft?.name ?? '');
  const [username, setUsername] = useState(coach?.username ?? '');
  const [email, setEmail] = useState(coach?.email ?? draft?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initialError);
  const [saving, setSaving] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!coach) { onCreate({ name, email }); return; }
    setSaving(true); setError('');
    try {
      await api('/api/admin/users', 'PATCH', { id: coach.id, ...(name.trim() !== coach.name && { name }), ...(username.trim().toLowerCase() !== coach.username && { username }), ...(email.trim().toLowerCase() !== coach.email && { email }), ...(password && { password }) });
      onSaved(password ? { name: name.trim(), username: username.trim().toLowerCase(), password } : undefined);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se ha podido guardar.'); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="confirm-dialog coach-dialog" aria-labelledby="coach-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <form onSubmit={submit}>
      <div className="confirm-body coach-form">
        <h2 id="coach-title">{coach ? `Editar a ${coach.name || coach.username}` : 'Nuevo entrenador'}</h2>
        <label htmlFor="coach-name">Nombre</label>
        <input id="coach-name" required maxLength={80} autoComplete="off" placeholder="Ej.: Ana García" value={name} onChange={event => setName(event.target.value)} />
        <label htmlFor="coach-email">Correo (opcional)</label>
        <input id="coach-email" type="email" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="coach-email-help" placeholder="Ej.: ana@gmail.com" value={email} onChange={event => setEmail(event.target.value)} />
        <p id="coach-email-help" className="field-help">Con él podrá recuperar la contraseña por su cuenta. Sin correo, tendrás que cambiársela tú.</p>
        {coach && <>
        <label htmlFor="coach-username">Usuario</label>
        <input id="coach-username" required minLength={4} maxLength={64} pattern="[A-Za-z0-9_\-]+" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="coach-username-help" placeholder="Ej.: ana_garcia" value={username} onChange={event => setUsername(event.target.value)} />
        <p id="coach-username-help" className="field-help">Con este usuario iniciará sesión. Letras, números, - y _.</p>
        <label htmlFor="coach-password">Nueva contraseña (opcional)</label>
        <div className="password-field">
          <input id="coach-password" type={showPassword ? 'text' : 'password'} minLength={8} autoComplete="new-password" placeholder="Déjala vacía para mantenerla" value={password} onChange={event => setPassword(event.target.value)} />
          <button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(show => !show)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{showPassword
              ? <><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.39-1.61" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><path d="m2 2 20 20" /></>
              : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}</svg>
          </button>
        </div>
        <p className="field-help">Si la cambias, se cerrarán sus sesiones abiertas y podrás compartir los nuevos datos.</p>
        </>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button type="button" className="dialog-close" aria-label="Cerrar" onClick={() => dialog.current?.close()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button>
      </div>
      <div className="confirm-actions"><button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Cancelar</button><button className="button confirm-button" disabled={saving} aria-busy={saving}>{saving ? 'Guardando…' : coach ? 'Guardar' : 'Crear acceso'}</button></div>
    </form>
  </dialog>;
}

function Analytics({ stats, users, loading }: { stats?: Stats; users?: Coach[]; loading: boolean }) {
  const [metric, setMetric] = useState<Metric>('clips');
  const [active, setActive] = useState<number | null>(null);
  if (!stats) return <section aria-labelledby="stats-title"><h1 id="stats-title" className="admin-title">Analíticas</h1><p className="admin-empty">{loading ? 'Cargando…' : 'No hay datos todavía.'}</p></section>;
  const label = METRICS.find(item => item.key === metric)!.label.toLowerCase();
  const max = Math.max(1, ...stats.days.map(day => day[metric]));
  const total = stats.days.reduce((sum, day) => sum + day[metric], 0);
  const shown = active === null ? null : stats.days[active];
  const ranked = [...(users ?? [])].sort((a, b) => b.clips - a.clips || b.sessions - a.sessions);
  return <section aria-labelledby="stats-title">
    <h1 id="stats-title" className="admin-title">Analíticas</h1>
    <p className="admin-description">Totales desde que se activó el registro de uso. Una sesión cuenta cuando empieza la reproducción de la cámara.</p>
    <dl className="kpis">
      <div><dt>Clips guardados</dt><dd>{number.format(stats.totals.clips)}</dd></div>
      <div><dt>Sesiones iniciadas</dt><dd>{number.format(stats.totals.sessions)}</dd></div>
      <div><dt>Aperturas de la app</dt><dd>{number.format(stats.totals.opens)}</dd></div>
      <div><dt>Entrenadores activos</dt><dd>{number.format(stats.totals.active)}<span> en 7 días</span></dd></div>
    </dl>
    <div className="chart-card">
      <div className="chart-head">
        <h2>Últimos 30 días</h2>
        <div className="metric-options" role="group" aria-label="Dato de la gráfica">{METRICS.map(item => <button key={item.key} type="button" aria-pressed={metric === item.key} onClick={() => setMetric(item.key)}>{item.label}</button>)}</div>
        <p aria-live="polite">{shown ? `${dayLabel(shown.day)}: ${number.format(shown[metric])} ${label}` : `${number.format(total)} ${label} en total`}</p>
      </div>
      <div className="chart" onPointerLeave={() => setActive(null)}>
        <span className="chart-max" aria-hidden="true">{number.format(max)}</span>
        <div className="chart-bars">{stats.days.map((day, index) => <button key={day.day} type="button" className={`chart-bar ${active === index ? 'is-active' : ''}`} aria-label={`${dayLabel(day.day)}: ${day[metric]} ${label}`} onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}><span style={{ height: `${(day[metric] / max) * 100}%` }} /></button>)}</div>
        <div className="chart-axis" aria-hidden="true"><span>{dayLabel(stats.days[0].day)}</span><span>{dayLabel(stats.days[stats.days.length - 1].day)}</span></div>
      </div>
    </div>
    <p className="field-help">Los eventos sin conexión se añaden cuando el entrenador vuelve a conectarse. Los vídeos no se envían.</p>
    <h2 className="admin-subtitle">Por entrenador</h2>
    {ranked.length ? <div className="table-scroll"><table className="admin-table">
      <thead><tr><th scope="col">Entrenador</th><th scope="col">Clips</th><th scope="col">Sesiones</th><th scope="col">Último uso</th></tr></thead>
      <tbody>{ranked.map(coach => <tr key={coach.id}><th scope="row">{coach.name || coach.username}</th><td>{number.format(coach.clips)}</td><td>{number.format(coach.sessions)}</td><td>{lastSeen(coach)}</td></tr>)}</tbody>
    </table></div> : <p className="admin-empty">Todavía no hay entrenadores.</p>}
  </section>;
}
