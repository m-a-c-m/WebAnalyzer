# 🔎 Web Analyzer — Free Website Analysis Tool

**Free Website Analysis Tool.** Analyze any domain in seconds and get a full technical report: DNS, WHOIS, SSL, redirects, subdomains, email security (SPF/DKIM/DMARC), SEO, performance, carbon footprint and tech stack. Passive analysis of public data — no sign-up, no ads, no intrusive scanning.

🌐 **Demo en vivo / Live demo:** [miguelacm.es/tools/web-analyzer](https://miguelacm.es/tools/web-analyzer)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

> ⚠️ **Requiere backend / Requires a backend.** Unlike most tools in this collection, Web Analyzer is **not** purely client-side: it relies on Next.js API routes (DNS, WHOIS, SSL, etc.). You must deploy it to a host that runs Node (Vercel, Render, a VPS…) — a static export will not work. See [Quick start](#-quick-start).

---

## ✨ Features

- **Infraestructura / Infrastructure:** DNS records (A, AAAA, MX, TXT, NS, CNAME, SOA), WHOIS/RDAP with domain expiry, SSL/TLS grade and redirect chain
- **Seguridad / Security:** Email security verdict (SPF, DKIM, DMARC), mixed-content detection and passive subdomains from Certificate Transparency logs
- **SEO:** 0–100 score across 19 checks, quick wins, structured data (JSON-LD types), hreflang and basic accessibility hints
- **Rendimiento / Performance:** TTFB, page size, compression, cache, HTTP/2 and website carbon footprint
- **Tecnología / Tech stack:** Passive fingerprinting of server, CDN, hosting, framework, CMS, analytics, libraries, payment and security tools
- **Rastreo / Crawlability:** robots.txt parsing (blocked paths, crawl-delay) and sitemap.xml validation
- **Autoridad / Domain authority:** Open PageRank score (optional, free API key)
- **Vista previa / Preview:** Real screenshot of the page
- **Pasivo y legal / Passive & legal:** Only public data, no port scanning, no vulnerability probing, nothing stored
- **Embebible / Embeddable:** Use it as an iframe on any website
- **Open source:** MIT license, use it freely

---

## 🚀 Quick start

```bash
git clone https://github.com/m-a-c-m/WebAnalyzer.git
cd WebAnalyzer
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To go live, deploy to any Node host (Vercel recommended):

```bash
npm run build
npm run start
```

### Environment variables (optional)

```env
# Enables the "Domain authority" block (Open PageRank). Free key at https://www.domcop.com/openpagerank/
OPEN_PAGERANK_KEY=your_key_here

# Used only for canonical/OG metadata and embed snippet
NEXT_PUBLIC_SITE_URL=https://miguelacm.es/tools/web-analyzer
NEXT_PUBLIC_EMBED_URL=https://miguelacm.es/embed/web-analyzer
```

> The tool works fully without any key — `OPEN_PAGERANK_KEY` only adds the domain-authority score. After adding env vars on your host, **redeploy** for them to take effect.

---

## 📦 Embed on your website

### Iframe (plug & play)

```html
<iframe
  src="https://miguelacm.es/embed/web-analyzer"
  width="100%"
  height="800"
  style="border:none;border-radius:12px;"
  title="Web Analyzer — miguelacm.es"
  loading="lazy"
></iframe>
```

### Link with attribution (recommended for backlink)

```html
<a href="https://miguelacm.es/tools/web-analyzer" target="_blank" rel="noopener">
  Web Analyzer — free website analysis tool by MACM
</a>
```

> 💡 The link option generates a real backlink that benefits the project. Recommended if your platform supports custom HTML.

---

## 🛠 Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org) | 16 | React framework + API routes |
| [TypeScript](https://www.typescriptlang.org) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | 4 | Styling |
| [Zod](https://zod.dev) | 4 | Input validation |
| [react-icons](https://react-icons.github.io/react-icons/) | 5 | Icons |

External public sources used (all free, no key except Open PageRank): Cloudflare DNS-over-HTTPS, rdap.org / rdap.iana.org, Certificate Transparency (crt.sh, CertSpotter), Website Carbon API, thum.io (preview).

---

## ⚖️ Is it legal?

Yes. Web Analyzer performs **passive analysis of public data only** — DNS, RDAP/WHOIS, Certificate Transparency, the public TLS certificate and the public HTML of the page. This is exactly what SSL Labs, MXToolbox, Wappalyzer and any SEO tool do. There is no port scanning, no vulnerability probing, no intrusive access, and **no data is stored or logged**. Some data (geolocation, SEO, rankings) comes from third-party public services and changes over time — use it as guidance, not absolute truth.

---

## 📄 License

MIT © [Miguel Ángel Colorado Marin (MACM)](https://miguelacm.es)

Built with ❤️ by **[MACM](https://miguelacm.es)** — Full Stack Developer & Cybersecurity Specialist from Guadalajara, Spain.

- 🌐 Portfolio: [miguelacm.es](https://miguelacm.es)
- 💼 LinkedIn: [linkedin.com/in/macm](https://www.linkedin.com/in/macm/)
- 🐙 GitHub: [github.com/m-a-c-m](https://github.com/m-a-c-m)
