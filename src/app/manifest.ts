import type { MetadataRoute } from 'next';
export const dynamic = 'force-static';
export default function manifest(): MetadataRoute.Manifest {
  return { id: '/', name: 'rePlay', short_name: 'rePlay', lang: 'es', start_url: '/', scope: '/', display: 'standalone',
    description: 'Vídeo con retraso para revisar tu movimiento en cualquier deporte.', background_color: '#ffffff', theme_color: '#24542b',
    icons: [{ src: '/icon-192.png?v=athlete-1', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png?v=athlete-1', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icon-maskable.png?v=athlete-1', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
}
