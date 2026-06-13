import type { Metadata } from "next";
import WebAnalyzer from "@/components/WebAnalyzer";
import { MdTravelExplore } from "react-icons/md";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://miguelacm.es/tools/web-analyzer";
const EMBED_URL = process.env.NEXT_PUBLIC_EMBED_URL || "https://miguelacm.es/embed/web-analyzer";

export const metadata: Metadata = {
  title: "Web Analyzer — Free Website Analysis Tool",
  description:
    "Analyze any website in seconds: DNS, WHOIS, SSL, redirects, subdomains, email security, SEO, performance and tech stack. Free, no sign-up, passive analysis of public data.",
  alternates: {
    canonical: SITE_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Web Analyzer — Free Website Analysis Tool",
  url: SITE_URL,
  description:
    "Full technical website report in one place: DNS, WHOIS, SSL grade, redirect chain, subdomains, SPF/DKIM/DMARC, SEO score, performance, carbon footprint and detected tech stack. Free, no sign-up.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  inLanguage: "en",
  offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  author: {
    "@type": "Person",
    name: "Miguel Ángel Colorado Marin",
    url: "https://miguelacm.es",
  },
  featureList: [
    "DNS records (A, AAAA, MX, TXT, NS, CNAME, SOA)",
    "WHOIS / RDAP lookup with domain expiry",
    "SSL/TLS certificate grade",
    "Redirect chain follower",
    "Passive subdomain discovery (CT logs)",
    "Email security: SPF, DKIM, DMARC",
    "SEO score with 19 checks",
    "Performance and carbon footprint",
    "Tech stack detection",
    "robots.txt and sitemap.xml analysis",
    "No API key required",
    "No sign-up required",
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm text-primary">
              <MdTravelExplore className="text-base" />
              Free tool · Open source
            </div>
            <h1 className="mb-3 text-4xl font-bold text-white md:text-5xl">
              Web Analyzer
            </h1>
            <p className="mb-2 text-lg text-text-muted">
              Analyze any website in seconds: infrastructure, security, SEO, performance and tech stack in a single report.
            </p>
            <p className="text-sm text-text-muted/60">
              By{" "}
              <a
                href="https://miguelacm.es"
                target="_blank"
                rel="noopener noreferrer"
                className="gradient-text font-medium hover:opacity-80 transition-opacity"
              >
                MACM
              </a>{" "}
              · No sign-up · No ads · Passive analysis
            </p>
          </div>

          <div className="glass rounded-2xl border border-border/20 p-6 md:p-8">
            <WebAnalyzer locale="en" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                icon: "🌐",
                title: "Infrastructure & security",
                desc: "DNS records, WHOIS with domain expiry, SSL/TLS grade, redirect chain, passive subdomains and email security (SPF, DKIM, DMARC) in one pass.",
              },
              {
                icon: "📈",
                title: "SEO & performance",
                desc: "A 0–100 SEO score across 19 checks, quick wins, structured data, hreflang, accessibility hints, TTFB, compression and carbon footprint.",
              },
              {
                icon: "🧩",
                title: "Tech stack detection",
                desc: "Passively fingerprints the server, CDN, hosting, framework, CMS, analytics, libraries, payment and security tools from headers and HTML.",
              },
            ].map((item) => (
              <div
                key={item.icon}
                className="glass rounded-xl border border-border/15 p-5"
              >
                <span className="mb-3 block text-2xl">{item.icon}</span>
                <h3 className="mb-1 font-semibold text-white">{item.title}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-border/20 bg-white/3 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              How to use Web Analyzer
            </h2>
            <ol className="space-y-3">
              {[
                { n: 1, text: "Type a domain or URL (e.g. example.com) and press Enter or click Analyze." },
                { n: 2, text: "Ten checks run in parallel — DNS, WHOIS, SSL, redirects, subdomains, page (SEO + tech + performance), email, crawlability, carbon and domain authority." },
                { n: 3, text: "Read the global score and the quick wins at the top, then expand each section for full detail and actionable tips." },
                { n: 4, text: "Share the result or bookmark the URL to track a site over time." },
              ].map((step) => (
                <li key={step.n} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {step.n}
                  </span>
                  <p className="text-sm text-text-muted leading-relaxed">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-white">Frequently asked questions</h2>
            {[
              {
                q: "Is this legal? Does it scan the target site?",
                a: "Yes, it is legal. Web Analyzer only queries public data — DNS, RDAP/WHOIS, Certificate Transparency logs, the TLS certificate and the public HTML of the page — exactly what SSL Labs, MXToolbox and Wappalyzer do. There is no port scanning, no vulnerability probing and no intrusive access.",
              },
              {
                q: "Do you store the domains I analyze?",
                a: "No. Every check runs server-side against public sources and nothing is logged or stored. The tool is stateless.",
              },
              {
                q: "Why does subdomain discovery find only a few subdomains?",
                a: "It is passive: it lists subdomains that appear in public Certificate Transparency logs (i.e. that have an issued SSL certificate). It does not brute-force or crawl, so internal or non-SSL subdomains will not appear.",
              },
              {
                q: "Why is there no backlink list?",
                a: "A full backlink list requires a paid index (Ahrefs, Moz, Majestic). Web Analyzer instead shows Open PageRank — a free 0–10 domain authority score — as a proxy for link strength. It requires a free API key (see the repo README).",
              },
              {
                q: "Can I run this myself?",
                a: "Yes. It is open source (MIT). Unlike a purely client-side tool, it needs the API routes, so deploy it to any Node host (Vercel, etc.). See the repository README for setup and optional environment variables.",
              },
            ].map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-border/20 bg-white/3 p-5"
              >
                <h3 className="mb-2 font-medium text-white">{item.q}</h3>
                <p className="text-sm text-text-muted leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-border/20 bg-white/3 p-6">
            <h2 className="mb-2 font-semibold text-white">
              Embed this tool on your website
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              Add Web Analyzer to any page with a simple iframe, or link to it with attribution.
            </p>
            <div className="mb-3 rounded-lg bg-black/40 p-3">
              <p className="mb-1 text-xs text-text-muted/60">Iframe (plug & play):</p>
              <code className="text-xs text-green-400 break-all">
                {`<iframe src="${EMBED_URL}" width="100%" height="800" style="border:none;border-radius:12px;" title="Web Analyzer — miguelacm.es" loading="lazy"></iframe>`}
              </code>
            </div>
            <div className="rounded-lg bg-black/40 p-3">
              <p className="mb-1 text-xs text-text-muted/60">
                Link with attribution (recommended for backlink):
              </p>
              <code className="text-xs text-green-400 break-all">
                {`<a href="${SITE_URL}" target="_blank" rel="noopener">Web Analyzer — free website analysis tool by MACM</a>`}
              </code>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
