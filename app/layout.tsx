// app/layout.tsx (Root Layout)
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Compucosta Admin',
    template: '%s · Compucosta Admin',
  },
  description: 'Panel de administración de Computadores de la Costa',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: '#bd1729',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <link rel="icon" href="/img.png" />
      </head>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
