import { getSession, handle } from './_lib/auth.js';

export const GET = handle(async request => Response.json(await getSession(request)));
