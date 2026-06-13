import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://miguelacm.es/tools/web-analyzer";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Web Analyzer — Free Website Analysis Tool", template: "%s | Web Analyzer" },
  description: "Analyze any website in seconds: DNS, WHOIS, SSL, redirects, subdomains, email security (SPF/DKIM/DMARC), SEO, performance and tech stack. Free, no sign-up, passive analysis of public data.",
  keywords: ["web analyzer", "website analysis", "seo analyzer", "dns lookup", "whois lookup", "ssl checker", "tech stack detector", "spf dkim dmarc checker", "analizar web gratis"],
  authors: [{ name: "Miguel Ángel Colorado Marin", url: "https://miguelacm.es" }],
  creator: "Miguel Ángel Colorado Marin",
  openGraph: {
    title: "Web Analyzer — Free Website Analysis Tool",
    description: "DNS, WHOIS, SSL, email security, SEO, performance and tech stack in one report. Free, no sign-up. By MACM.",
    url: SITE_URL,
    siteName: "Web Analyzer — MACM",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Web Analyzer — Free Website Analysis Tool",
    description: "Full technical website report in seconds. Free. By MACM · miguelacm.es",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="author" href="https://miguelacm.es" />
        <meta name="author" content="Miguel Ángel Colorado Marin" />
        <meta name="copyright" content="Miguel Ángel Colorado Marin — miguelacm.es" />
      </head>
      <body className="antialiased">
        {children}
        <footer className="pb-8 text-center text-xs text-text-muted/40">
          ⚡ by{" "}
          <a href="https://miguelacm.es" target="_blank" rel="noopener noreferrer"
            className="text-text-muted/60 transition-colors hover:text-text-muted underline-offset-2 hover:underline">
            MACM · miguelacm.es
          </a>
          {" · "}
          <a href="https://github.com/m-a-c-m/WebAnalyzer" target="_blank" rel="noopener noreferrer"
            className="text-text-muted/60 transition-colors hover:text-text-muted underline-offset-2 hover:underline">
            Open source
          </a>
        </footer>
      </body>
    </html>
  );
}
