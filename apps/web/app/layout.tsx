import { JetBrains_Mono, Noto_Sans, Merriweather_Sans } from 'next/font/google';
import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'material-symbols/outlined.css';
import './globals.css';
import LayoutShell from '@/components/layout/LayoutShell';

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const notoSans = Noto_Sans({
  subsets: ['latin'],
  variable: '--font-noto',
  display: 'swap',
});

export const merriWeatherSans = Merriweather_Sans({
  subsets: ['latin'],
  variable: '--font-merriweather',
  display: 'swap',
  weight: ['800'],
});

export const metadata: Metadata = {
  title: 'DocSpyre AI',
  description: 'AI Powered document based tool',
  icons: {
    icon: [
      { url: '/images/Docspyre_logo.png', sizes: '64x64', type: 'image/png' },
      { url: '/images/Docspyre_logo.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/images/Docspyre_logo.png',
    apple: '/images/Docspyre_logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${jetbrainsMono.variable} ${notoSans.variable} ${merriWeatherSans.variable}`}
    >
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
