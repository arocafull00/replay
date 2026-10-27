import type { Metadata, Viewport } from 'next';
import './globals.css';
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://voley-delay.vercel.app');
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), title: { default: 'rePlay · Vídeo con retraso para entrenar', template: '%s · rePlay' },
  description: 'Revisa tu movimiento unos segundos después con la cámara de tu móvil. Vídeo local, sin audio ni grabaciones guardadas. Preparada para entrenar sin conexión.',
  alternates: { canonical: '/' }, manifest: '/manifest.webmanifest',
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'rePlay', statusBarStyle: 'black-translucent' },
  openGraph: { title: 'rePlay', description: 'Mira tu movimiento unos segundos después. Cámara local para cualquier deporte.', locale: 'es_ES', type: 'website', images: [{ url: '/og.png?v=replay', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/og.png?v=replay'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#24542b' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
