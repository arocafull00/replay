import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';
import vercelConfig from './vercel.json';

const config: NextConfig = {
  output: 'export',
  // A production build must not replace the running dev server's files.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  images: { unoptimized: true },
  poweredByHeader: false,
  // The dev server's headers override vercel dev's production CSP.
  // React needs eval for debugging; keep it disabled in the static deployment.
  ...(process.env.NODE_ENV === 'development' && {
    async headers() {
      return vercelConfig.headers.map(route => ({
        ...route,
        headers: route.headers.map(header => header.key === 'Content-Security-Policy'
          ? { ...header, value: header.value.replace('script-src ', "script-src 'unsafe-eval' ") }
          : header),
      }));
    },
  }),
};
export default withSentryConfig(config, { org: 'adrian-rocafull', project: 'replay', sentryUrl: 'https://de.sentry.io', authToken: process.env.SENTRY_AUTH_TOKEN, widenClientFileUpload: true, silent: !process.env.CI });
