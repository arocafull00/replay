import type { Metadata } from 'next';
import '../admin.css';
export const metadata: Metadata = { title: 'Administración', description: 'Gestiona los entrenadores de rePlay y consulta el uso de la aplicación.', robots: { index: false, follow: false }, alternates: { canonical: '/admin' } };
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children; }
