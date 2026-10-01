import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from '@/components/SwRegister';

export const metadata: Metadata = {
  title: 'Waypoint Dispatch',
  description: 'Delivery planning for Waypoint Group — dispatcher, loader, driver and store manager.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16181D' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
