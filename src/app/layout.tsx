import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientLayout } from "@/components/ClientLayout";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  fallback: ["system-ui", "arial"],
});

export const metadata: Metadata = {
  title: "GigsManager - Track Your Performances",
  description:
    "Manage live music performances, track payments, and calculate musician earnings.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64x64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "manifest",
        url: "/manifest.json",
      },
    ],
  },
};


export const viewport: Viewport = {
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://supabase.co" />
          <link rel="icon" href="/favicon.png" type="image/png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="GigsManager" />
        <meta name="msapplication-TileColor" content="#0f172a" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, minimal-ui" />
        {/* 
          Pre-hydration theme script: runs before React hydrates so the
          server-rendered HTML already carries the correct dark/light class.
          Without this, the server renders with no 'dark' class but the
          ThemeProvider effect adds it immediately on mount, causing a
          flash and potential hydration mismatch for theme-dependent styling.
          suppressHydrationWarning on <html> (above) tolerates the class
          difference for the html element itself; the script keeps the
          initial paint consistent with the hydrated result.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('theme');
                if (theme !== 'system' && theme !== 'light' && theme !== 'dark') theme = 'system';
                var html = document.documentElement;
                if (theme === 'dark') {
                  html.classList.add('dark');
                } else if (theme === 'light') {
                  html.classList.remove('dark');
                } else {
                  // system preference — defer to matchMedia; matches what ThemeProvider will do
                  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    html.classList.add('dark');
                  } else {
                    html.classList.remove('dark');
                  }
                }
              } catch (e) {}
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  setTimeout(function () {
                    if (document.documentElement.getAttribute('data-app-mounted') === '1') return;
                    var retried = false;
                    try { retried = sessionStorage.getItem('__gigs_hydration_reload') === '1'; } catch (e) {}
                    if (!retried) {
                      try { sessionStorage.setItem('__gigs_hydration_reload', '1'); } catch (e) {}
                      console.warn('[HydrationGuard] React did not hydrate in time; performing a single cache-busting reload');
                      var sep = window.location.search ? '&' : '?';
                      window.location.replace(window.location.pathname + window.location.search + sep + '_r=' + Date.now() + window.location.hash);
                      return;
                    }
                    // Already retried once - stop hiding behind the spinner and
                    // surface a manual reload action instead of spinning forever.
                    var banner = document.createElement('div');
                    banner.setAttribute('style', 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:#0f172a;color:#f8fafc;padding:12px 20px;border-radius:12px;font-family:system-ui,sans-serif;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);');
                    banner.innerHTML = 'The app failed to start. <a href="/" style="color:#93c5fd;text-decoration:underline;">Reload</a>';
                    document.body.appendChild(banner);
                  }, 12000);
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              process.env.NODE_ENV === "production"
                ? `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                  if (isLocalhost) {
                    navigator.serviceWorker.getRegistrations().then((regs) => {
                      regs.forEach((reg) => reg.unregister());
                    }).catch((err) => {
                      console.log('Service Worker cleanup failed:', err);
                    });
                    if ('caches' in window) {
                      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
                    }
                    return;
                  }

                  navigator.serviceWorker
                    .register('/sw.js', { updateViaCache: 'none' })
                    .then((registration) => {
                      console.log('Service Worker registered');
                      // Re-validate in the background; a stalled update must
                      // never block the React execution loop.
                      registration.update().catch(() => {});

                      if (registration.waiting) {
                        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                      }

                      registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                          }
                        });
                      });
                    })
                    .catch((err) => {
                      console.log('Service Worker registration failed:', err);
                    });

                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (window.__swRefreshing) return;
                    // Reload-loop guard: a hard refresh can re-install the
                    // worker and trigger back-to-back controller claims, which
                    // previously caused endless reloads. Only auto-reload once
                    // per 15s window.
                    var lastReload = 0;
                    try {
                      lastReload = Number(sessionStorage.getItem('__gigs_sw_reload_ts') || 0);
                    } catch (e) {}
                    if (Date.now() - lastReload < 15000) {
                      console.log('Service Worker controller change suppressed to avoid reload loop');
                      return;
                    }
                    try {
                      sessionStorage.setItem('__gigs_sw_reload_ts', String(Date.now()));
                    } catch (e) {}
                    window.__swRefreshing = true;
                    window.location.reload();
                  });
                });
              }
            `
                : `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((regs) => {
                  regs.forEach((reg) => reg.unregister());
                }).catch((err) => {
                  console.log('Service Worker cleanup failed:', err);
                });
                if ('caches' in window) {
                  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
                }
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.className} ${inter.variable}`} suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
