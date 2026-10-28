'use client';

import { DelayApp } from '@/components/delay-app';
import { Login } from '@/components/login';
import { useSignedIn } from '@/lib/auth';
export default function Page() { return useSignedIn() ? <DelayApp /> : <Login />; }
