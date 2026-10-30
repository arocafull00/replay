import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '@/components/auth-provider';
import { PWA_INSTALL_SCRIPT } from '@/lib/pwa-install';
import './globals.css';
import './onboarding.css';
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'https://replayapp.vercel.app');
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl), title: { default: 'rePlay · Vídeo con retraso para entrenar', template: '%s · rePlay' },
  description: 'Revisa tu movimiento unos segundos después con la cámara de tu móvil. Elige el retraso y repasa cada ejercicio mientras entrenas.',
  alternates: { canonical: '/' }, manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/favicon.svg?v=athlete-1', type: 'image/svg+xml' }, { url: '/favicon.png?v=athlete-1', type: 'image/png', sizes: '48x48' }], shortcut: '/favicon.ico?v=athlete-1', apple: '/apple-touch-icon.png?v=athlete-1' },
  appleWebApp: { capable: true, title: 'rePlay', statusBarStyle: 'black-translucent' },
  openGraph: { title: 'rePlay', description: 'Mira tu movimiento unos segundos después. Cámara local para cualquier deporte.', url: '/', siteName: 'rePlay', locale: 'es_ES', type: 'website', images: [{ url: '/replay-share-v2.png', width: 1200, height: 630, type: 'image/png', alt: 'rePlay, repeticiones de tu movimiento para cualquier deporte' }] },
  twitter: { card: 'summary_large_image', images: [{ url: '/replay-share-v2.png', alt: 'rePlay, repeticiones de tu movimiento para cualquier deporte' }] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1c1c1c' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: PWA_INSTALL_SCRIPT }} /><script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('voley-delay:onboarding:v1')===null)document.documentElement.dataset.onboarding='pending';if(localStorage.getItem('replay:session:v1')===null)document.documentElement.dataset.auth='out'}catch(e){}" }} /></head><body><AuthProvider>{children}</AuthProvider><Analytics /><SpeedInsights /></body></html>;
}
