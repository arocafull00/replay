'use client';

import { ClerkProvider } from '@clerk/react';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!} proxyUrl={process.env.NEXT_PUBLIC_CLERK_PROXY_URL || undefined}>{children}</ClerkProvider>;
}
