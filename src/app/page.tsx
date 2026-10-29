'use client';

import { DelayApp } from '@/components/delay-app';
import { AccessGate } from '@/components/access-gate';
export default function Page() { return <AccessGate role="coach"><DelayApp /></AccessGate>; }
