// app/layout.tsx (Root Layout)
import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Admin Computadores de la costa',
  description: 'admin computadores de la costa',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/img.png" />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}