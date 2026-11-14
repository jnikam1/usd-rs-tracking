import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/schibsted-grotesk/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Har Paisa: USD to INR tracker',
  description:
    'Live USD to INR rate, which app gives the most rupees for your dollars after every fee, and alerts when the rate moves.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Har Paisa', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F1F4EE' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1813' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
