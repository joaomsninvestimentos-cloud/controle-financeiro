import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { AgentationGuard } from '@/components/AgentationGuard';
import { HappySeedsWatermark } from '@/components/HappySeedsWatermark';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ServiceWorkerRegistrar } from '@/components/PwaBoot';
import './globals.css';

const APP_NAME = 'Meu Controle Financeiro';
const APP_DESCRIPTION =
  'Controle suas receitas e despesas em Reais, com despesas fixas, orçamentos por categoria, contas compartilhadas e gráficos.';

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_NAME,
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iOS usa este ícone na tela inicial (152/167/180 conforme o aparelho)
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Finanças',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    // Windows/Edge: evita que o app instalado abra dentro do navegador
    'msapplication-TileColor': '#8FB39A',
    'msapplication-tap-highlight': 'no',
  },
};

export const viewport: Viewport = {
  // faixa verde clara no celular e combina com o tema escuro do app
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#8FB39A' },
    { media: '(prefers-color-scheme: dark)', color: '#2B2825' },
  ],
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  // permite desenhar atrás do notch/barra de gestos (usado com env(safe-area-*))
  viewportFit: 'cover',
  // no Android, encolhe a viewport quando o teclado abre
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {process.env.NODE_ENV === 'production' && (
          <Script
            async
            src={process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL}
            data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          />
        )}
      </head>
      <body className="antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <ServiceWorkerRegistrar />
        <HappySeedsWatermark />
        <AgentationGuard />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}
