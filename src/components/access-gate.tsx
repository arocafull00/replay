'use client';

import { Fragment, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Login } from '@/components/login';
import { useAppSession } from '@/lib/auth';

export function AccessGate({ role: requiredRole, children }: { role: 'admin' | 'coach'; children: ReactNode }) {
  const { signedIn, role, userId } = useAppSession();
  const router = useRouter();
  const redirectTo = signedIn && role && role !== requiredRole ? (role === 'admin' ? '/admin' : '/') : null;

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (!signedIn) return <Login />;
  if (!role || redirectTo) return <main className="login" aria-busy="true"><p role="status">Entrando…</p></main>;
  return <Fragment key={userId}>{children}</Fragment>;
}
