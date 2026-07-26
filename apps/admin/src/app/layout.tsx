import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/lib/providers';
import { es } from '@/i18n/es';
import './globals.css';

export const metadata: Metadata = {
  title: es.app.name,
  description: 'Portal de administración de DMTX',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
