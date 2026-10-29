import { handle, HttpError, requireUser } from './_lib/auth.js';
import { EVENT_TYPES, sql, type EventType } from './_lib/db.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const POST = handle(async request => {
  const userId = await requireUser(request);
  const body = await request.json().catch(() => null) as { events?: { id?: unknown; type?: unknown; at?: unknown }[] } | null;
  if (!Array.isArray(body?.events) || body.events.length > 50) throw new HttpError(400, 'Petición no válida.');
  const now = Date.now();
  const events = body.events.map(event => {
    if (!event || typeof event.id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.id) || !EVENT_TYPES.includes(event.type as EventType) || typeof event.at !== 'number' || !Number.isFinite(event.at)) throw new HttpError(400, 'Evento no válido.');
    return { id: event.id, type: event.type as EventType, at: new Date(Math.min(now, Math.max(now - WEEK, event.at))).toISOString() };
  });
  if (events.length) await sql`insert into events (user_id, event_id, type, created_at) select ${userId}, id, type, at from unnest(${events.map(event => event.id)}::text[], ${events.map(event => event.type)}::text[], ${events.map(event => event.at)}::timestamptz[]) as t(id, type, at) on conflict (user_id, event_id) do nothing`;
  return Response.json({ saved: events.length });
});
