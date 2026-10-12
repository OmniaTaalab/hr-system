
import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { AppProvider } from '@/components/layout/app-provider';
import { I18nProvider } from '@/components/i18n-provider';
import { NetworkStatusBanner } from '@/components/network-status-banner';
// import { HelpChat } from '@/components/help-chat';

const fontInter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const fontSpaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: 'HR Portal',
  description: 'A modern Human Resource Management System',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('hr_system_lang') || localStorage.getItem('nis_guide_lang');
                  var lang = stored === 'en' ? 'en' : 'ar';
                  if (lang === 'ar') {
                    document.documentElement.setAttribute('dir', 'rtl');
                    document.documentElement.setAttribute('lang', 'ar');
                    document.documentElement.classList.add('rtl');
                  } else {
                    document.documentElement.setAttribute('dir', 'ltr');
                    document.documentElement.setAttribute('lang', 'en');
                    document.documentElement.classList.remove('rtl');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={cn(
          "min-h-screen bg-background font-body antialiased",
          fontInter.variable,
          fontSpaceGrotesk.variable
        )}
      >
        <I18nProvider>
          <NetworkStatusBanner />
          <AppProvider>
            {children}
            {/* <HelpChat /> */}
          </AppProvider>
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}

