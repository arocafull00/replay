import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);
export const EVENT_TYPES = ['open', 'session', 'clip'] as const;
export type EventType = (typeof EVENT_TYPES)[number];
