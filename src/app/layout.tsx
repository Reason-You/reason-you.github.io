import type { Metadata } from "next";
import "./globals.css";
import Navigation from "@/components/layout/Navigation";
import Footer from "@/components/layout/Footer";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import SiteShell from "@/components/layout/SiteShell";
import { getConfig } from "@/lib/config";
import localFont from "next/font/local";

const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: false,
});

const crimsonText = localFont({
  src: [
    { path: "./fonts/crimson-text-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/crimson-text-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/crimson-text-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-crimson",
  adjustFontFallback: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const config = getConfig();
  const iconVersion = "20260222c";
  const seoTitle = config.site.seo_title || config.site.title;
  return {
    title: {
      default: `Home | ${config.author.name}`,
      template: `%s | ${config.author.name}`
    },
    description: config.site.description,
    keywords: [config.author.name, "PhD", "Research", config.author.institution],
    authors: [{ name: config.author.name }],
    creator: config.author.name,
    publisher: config.author.name,
    icons: {
      icon: [{ url: `${config.site.favicon}?v=${iconVersion}`, type: "image/png", sizes: "32x32" }],
      shortcut: [{ url: `/favicon-32.png?v=${iconVersion}` }],
      apple: [{ url: `/apple-touch-icon.png?v=${iconVersion}`, sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      title: seoTitle,
      description: config.site.description,
      siteName: `${config.author.name}'s Academic Website`,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const config = getConfig();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${crimsonText.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('theme-storage');
                const parsed = theme ? JSON.parse(theme) : null;
                const setting = parsed?.state?.theme || 'dark';
                const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                const effective = setting === 'dark' ? 'dark' : (setting === 'light' ? 'light' : (prefersDark ? 'dark' : 'light'));
                var root = document.documentElement;
                root.classList.add(effective);
                root.setAttribute('data-theme', effective);
              } catch (e) {
                var root = document.documentElement;
                root.classList.add('dark');
                root.setAttribute('data-theme', 'dark');
              }
            `,
          }}
        />
      </head>
      <body className={`font-sans antialiased`}>
        <ThemeProvider>
          <SiteShell
            navigation={
              <Navigation
                items={config.navigation}
                siteTitle={config.site.title}
                enableOnePageMode={config.features.enable_one_page_mode}
              />
            }
            footer={<Footer lastUpdated={config.site.last_updated} />}
          >
            {children}
          </SiteShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
