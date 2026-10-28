import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';
const config: NextConfig = { output: 'export', images: { unoptimized: true }, poweredByHeader: false };
export default withSentryConfig(config, { org: 'adrian-rocafull', project: 'replay', sentryUrl: 'https://de.sentry.io', authToken: process.env.SENTRY_AUTH_TOKEN, widenClientFileUpload: true, silent: !process.env.CI });
