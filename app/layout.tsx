import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const fontSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['300', '400', '500', '600', '700', '800'] });

export const dynamic = 'force-dynamic';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || process.env.NEXT_BASE_PATH || '';
const withBasePath = (path: string) => `${basePath}${path}`;
const serviceWorkerScope = basePath ? `${basePath}/` : '/';
const shouldRegisterServiceWorker = process.env.NODE_ENV === 'production';

export const viewport: Viewport = {
  themeColor: '#1e40af',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return {
    metadataBase: new URL(baseUrl),
    title: 'WNR Finance - Gestão Financeira Inteligente',
    description: 'Sistema completo de gestão financeira pessoal por Winner Soluções em Tecnologia',
    icons: {
      icon: withBasePath('/favicon.svg'),
      shortcut: withBasePath('/favicon.svg'),
      apple: withBasePath('/icons/apple-touch-icon.png'),
    },
    manifest: withBasePath('/manifest.json'),
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'WNR Finance',
    },
    openGraph: {
      title: 'WNR Finance - Gestão Financeira Inteligente',
      description: 'Sistema completo de gestão financeira pessoal por Winner Soluções em Tecnologia',
      images: [withBasePath('/og-image.png')],
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="WNR Finance" />
        <link rel="apple-touch-icon" href={withBasePath('/icons/apple-touch-icon.png')} />
        <link rel="apple-touch-icon" sizes="152x152" href={withBasePath('/icons/icon-152x152.png')} />
        <link rel="apple-touch-icon" sizes="180x180" href={withBasePath('/icons/apple-touch-icon.png')} />
        <meta name="mobile-web-app-capable" content="yes" />
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('error', function(e) {
            if (e.message && (e.message.includes('ERR_BLOCKED_BY_RESPONSE') || e.message.includes('cdnfonts'))) {
              e.preventDefault();
            }
          }, true);
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(reg) {
                  var scriptUrl = (reg.active && reg.active.scriptURL) || (reg.waiting && reg.waiting.scriptURL) || (reg.installing && reg.installing.scriptURL) || '';
                  try {
                    var scopePath = new URL(reg.scope).pathname;
                    if (scopePath === '/' && scriptUrl.endsWith('/sw.js')) reg.unregister();
                  } catch (_) {}
                });
              }).catch(function() {});
              if (!${shouldRegisterServiceWorker ? 'true' : 'false'}) return;
              navigator.serviceWorker.register('${withBasePath('/sw.js')}', { scope: '${serviceWorkerScope}' }).catch(function() {});
            });
          }
        `}} />
      </head>
      <body className={`${fontSans.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
