const FRONTEND_API = 'https://frontend-api.clerk.dev';
const DROPPED_REQUEST_HEADERS = ['host', 'connection', 'content-length', 'accept-encoding'];
const DROPPED_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

async function proxy(request: Request) {
  const proxyUrl = process.env.NEXT_PUBLIC_CLERK_PROXY_URL;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!proxyUrl || !secretKey) return new Response('Not found', { status: 404 });
  const incoming = new URL(request.url);
  const path = incoming.searchParams.get('__path') ?? '';
  incoming.searchParams.delete('__path');
  const headers = new Headers(request.headers);
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
  headers.set('Clerk-Proxy-Url', proxyUrl);
  headers.set('Clerk-Secret-Key', secretKey);
  headers.set('X-Forwarded-For', request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const response = await fetch(`${FRONTEND_API}/${path}${incoming.search}`, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
  });
  const out = new Headers(response.headers);
  for (const name of DROPPED_RESPONSE_HEADERS) out.delete(name);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
