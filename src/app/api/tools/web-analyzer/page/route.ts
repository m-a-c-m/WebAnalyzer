import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60_000;
const BLOCKED = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0)/i;

function getIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (rateLimit.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_REQUESTS) return false;
  hits.push(now);
  rateLimit.set(ip, hits);
  return true;
}

const schema = z.object({
  url: z
    .string()
    .url()
    .max(2000)
    .refine((v) => !BLOCKED.test(v), "Blocked"),
});

export interface SeoCheck {
  id: string;
  label: string;
  passed: boolean;
  value?: string;
  tip?: string;
  impact: "high" | "medium" | "low";
  points: number;
  maxPoints: number;
}

export interface TechItem {
  category: string;
  name: string;
  confidence: "high" | "medium" | "low";
}

export interface PageResult {
  url: string;
  finalUrl: string;
  status: number;
  frameable: boolean;
  seo: {
    score: number;
    grade: string;
    checks: SeoCheck[];
    quickWins: SeoCheck[];
  };
  tech: TechItem[];
  performance: {
    ttfb: number;
    totalMs: number;
    contentSize: number;
    compressed: boolean;
    cached: boolean;
    http2: boolean;
  };
  mixedContent: {
    total: number;
    urls: string[];
  };
  structuredData: {
    types: string[];
    count: number;
  };
  a11y: {
    imagesWithoutAlt: number;
    inputsWithoutLabel: number;
    hasSkipLink: boolean;
  };
  hreflangs: string[];
}

function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 55) return "D";
  return "F";
}

function metaContent(html: string, attr: string, val: string): string | undefined {
  const esc = val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const p1 = new RegExp(`<meta[^>]+${attr}=["']${esc}["'][^>]+content=["']([^"']*?)["']`, "i");
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+${attr}=["']${esc}["']`, "i");
  return html.match(p1)?.[1] ?? html.match(p2)?.[1];
}

function estimateWordCount(html: string): number {
  const text = html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}

function detectTech(html: string, headers: Record<string, string>): TechItem[] {
  const items: TechItem[] = [];
  const h = (k: string): string => headers[k.toLowerCase()] ?? "";
  const powered = h("x-powered-by").toLowerCase();
  const server = h("server").toLowerCase();

  // Server
  if (server.includes("nginx")) items.push({ category: "server", name: "Nginx", confidence: "high" });
  else if (server.includes("apache")) items.push({ category: "server", name: "Apache", confidence: "high" });
  else if (server.includes("cloudflare")) items.push({ category: "server", name: "Cloudflare", confidence: "high" });
  else if (server.includes("openresty")) items.push({ category: "server", name: "OpenResty", confidence: "high" });
  else if (server.includes("litespeed")) items.push({ category: "server", name: "LiteSpeed", confidence: "high" });
  else if (server) items.push({ category: "server", name: (server.split("/")[0] ?? server), confidence: "medium" });

  // CDN / Hosting
  if (h("cf-ray")) items.push({ category: "cdn", name: "Cloudflare", confidence: "high" });
  if (h("x-vercel-id") || h("x-vercel-cache")) items.push({ category: "hosting", name: "Vercel", confidence: "high" });
  if (h("x-netlify-cache-control") || h("x-nf-request-id")) items.push({ category: "hosting", name: "Netlify", confidence: "high" });
  if (h("x-amz-cf-id") || h("x-amz-cf-pop")) items.push({ category: "cdn", name: "AWS CloudFront", confidence: "high" });
  if (h("x-fastly-request-id")) items.push({ category: "cdn", name: "Fastly", confidence: "high" });
  if (h("x-github-request-id")) items.push({ category: "hosting", name: "GitHub Pages", confidence: "high" });
  if (h("x-wpe-request-id")) items.push({ category: "hosting", name: "WP Engine", confidence: "high" });
  if (h("x-kinsta-cache")) items.push({ category: "hosting", name: "Kinsta", confidence: "high" });
  if (h("x-sucuri-id") || h("x-sucuri-cache")) items.push({ category: "cdn", name: "Sucuri WAF", confidence: "high" });

  // Frameworks (SSR/SPA) — use else-if so only the most specific match wins
  if (powered.includes("next.js") || html.includes("__NEXT_DATA__")) {
    items.push({ category: "framework", name: "Next.js", confidence: "high" });
  } else if (powered.includes("nuxt") || html.includes("__NUXT__") || html.includes("/_nuxt/")) {
    items.push({ category: "framework", name: "Nuxt.js", confidence: "high" });
  } else if (html.includes("___gatsby") || html.includes("gatsby-build-")) {
    items.push({ category: "framework", name: "Gatsby", confidence: "high" });
  } else if (html.includes("__REMIX_MANIFEST") || html.includes('"__remix"')) {
    items.push({ category: "framework", name: "Remix", confidence: "high" });
  } else if (html.includes("__vue_app__") || html.includes("data-v-app")) {
    items.push({ category: "framework", name: "Vue.js", confidence: "high" });
  } else if (html.includes("_nghost-") || html.includes('ng-version="')) {
    items.push({ category: "framework", name: "Angular", confidence: "high" });
  }

  // CMS — independent checks (a site can have WordPress + WooCommerce)
  const isWP = html.includes("wp-content/") || html.includes("wp-json/") || html.includes("wp-includes/");
  if (isWP) {
    items.push({ category: "cms", name: "WordPress", confidence: "high" });
    if (html.includes("woocommerce") || html.includes("/wc-api/")) {
      items.push({ category: "cms", name: "WooCommerce", confidence: "high" });
    }
    if (html.includes("data-elementor-type") || html.includes("elementor-kit-")) {
      items.push({ category: "library", name: "Elementor", confidence: "high" });
    }
  } else if (html.includes("cdn.shopify.com") || html.includes("myshopify.com")) {
    items.push({ category: "cms", name: "Shopify", confidence: "high" });
  } else if (html.includes("webflow.io") || html.includes("data-wf-")) {
    items.push({ category: "cms", name: "Webflow", confidence: "high" });
  } else if (html.includes("static.wixstatic.com")) {
    items.push({ category: "cms", name: "Wix", confidence: "high" });
  } else if (html.includes("assets.squarespace.com")) {
    items.push({ category: "cms", name: "Squarespace", confidence: "high" });
  } else if (html.includes("/ghost/api/") || html.includes("ghost.io")) {
    items.push({ category: "cms", name: "Ghost", confidence: "high" });
  } else if (html.includes("/sites/default/files/") || html.includes("Drupal.settings")) {
    items.push({ category: "cms", name: "Drupal", confidence: "medium" });
  } else if (html.includes("/components/com_") || html.includes("/modules/mod_content")) {
    items.push({ category: "cms", name: "Joomla", confidence: "medium" });
  } else if (html.includes("prestashop") || html.includes("/modules/ps_")) {
    items.push({ category: "cms", name: "PrestaShop", confidence: "high" });
  } else if (html.includes("Mage.Cookies") || html.includes("Magento_")) {
    items.push({ category: "cms", name: "Magento", confidence: "high" });
  }

  // Analytics
  if (html.includes("googletagmanager.com/gtm.js") || html.includes("'GTM-")) {
    items.push({ category: "analytics", name: "Google Tag Manager", confidence: "high" });
  }
  if (
    html.includes("googletagmanager.com/gtag/js") ||
    html.includes("google-analytics.com/analytics.js") ||
    html.includes("gtag('config'")
  ) {
    items.push({ category: "analytics", name: "Google Analytics", confidence: "high" });
  }
  if (html.includes("hotjar.com")) items.push({ category: "analytics", name: "Hotjar", confidence: "high" });
  if (html.includes("cdn.amplitude.com")) items.push({ category: "analytics", name: "Amplitude", confidence: "high" });
  if (html.includes("js.intercomcdn.com")) items.push({ category: "analytics", name: "Intercom", confidence: "high" });
  if (html.includes("cdn.segment.com") || html.includes("segment.io/analytics")) {
    items.push({ category: "analytics", name: "Segment", confidence: "high" });
  }
  if (html.includes("static.clarity.ms")) items.push({ category: "analytics", name: "Microsoft Clarity", confidence: "high" });
  if (html.includes("crisp.chat/js/")) items.push({ category: "analytics", name: "Crisp", confidence: "high" });
  if (html.includes("cdn.lr-ingest.io") || html.includes("logrocket.com")) {
    items.push({ category: "analytics", name: "LogRocket", confidence: "high" });
  }

  // Libraries
  if (html.includes("jquery.min.js") || html.includes("/jquery-") || (html.includes("jquery") && html.includes(".js"))) {
    items.push({ category: "library", name: "jQuery", confidence: "high" });
  }
  if (html.includes("bootstrap.min.css") || html.includes("bootstrap.bundle.min.js") || html.includes("bootstrap.css")) {
    items.push({ category: "library", name: "Bootstrap", confidence: "high" });
  }
  if (html.includes("font-awesome") || html.includes("fontawesome")) {
    items.push({ category: "library", name: "Font Awesome", confidence: "high" });
  }
  if (html.includes("cdn.tailwindcss.com")) {
    items.push({ category: "library", name: "Tailwind CSS", confidence: "high" });
  }
  if (html.includes("swiperjs.com") || html.includes("swiper.min.js") || html.includes("swiper-bundle")) {
    items.push({ category: "library", name: "Swiper", confidence: "high" });
  }
  if (html.includes("gsap.min.js") || html.includes("gsap.com") || html.includes("TweenMax")) {
    items.push({ category: "library", name: "GSAP", confidence: "high" });
  }

  // Payment
  if (html.includes("js.stripe.com")) {
    items.push({ category: "payment", name: "Stripe", confidence: "high" });
  }
  if (html.includes("paypal.com/sdk/js") || html.includes("paypalobjects.com")) {
    items.push({ category: "payment", name: "PayPal", confidence: "high" });
  }

  // Security / captcha
  if (html.includes("google.com/recaptcha") || html.includes("recaptcha/api.js")) {
    items.push({ category: "security", name: "Google reCAPTCHA", confidence: "high" });
  }
  if (html.includes("hcaptcha.com/1/api.js")) {
    items.push({ category: "security", name: "hCaptcha", confidence: "high" });
  }
  if (html.includes("challenges.cloudflare.com/turnstile")) {
    items.push({ category: "security", name: "CF Turnstile", confidence: "high" });
  }

  // Language
  if (powered.includes("php")) items.push({ category: "language", name: "PHP", confidence: "high" });

  return items;
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const raw = req.nextUrl.searchParams.get("url") ?? "";
  const parsed = schema.safeParse({ url: raw });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const { url } = parsed.data;
  const start = Date.now();

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "miguelacm.es/web-analyzer" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 502 });
  }

  const ttfb = Date.now() - start;

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });

  const contentType = headers["content-type"] ?? "";
  if (!contentType.includes("text/html")) {
    return NextResponse.json({ error: "URL does not return HTML" }, { status: 422 });
  }

  const rawText = await res.text();
  const totalMs = Date.now() - start;
  const html = rawText.slice(0, 500_000);

  const origin = (() => { try { return new URL(res.url).origin; } catch { return ""; } })();

  const [robotsSettled, sitemapSettled] = await Promise.allSettled([
    origin
      ? fetch(`${origin}/robots.txt`, { method: "HEAD", headers: { "User-Agent": "miguelacm.es/web-analyzer" }, signal: AbortSignal.timeout(5_000) })
      : Promise.reject(),
    origin
      ? fetch(`${origin}/sitemap.xml`, { method: "HEAD", headers: { "User-Agent": "miguelacm.es/web-analyzer" }, signal: AbortSignal.timeout(5_000) })
      : Promise.reject(),
  ]);

  const hasRobots = robotsSettled.status === "fulfilled" && robotsSettled.value.ok;
  const hasSitemap = sitemapSettled.status === "fulfilled" && sitemapSettled.value.ok;

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  const metaDesc = metaContent(html, "name", "description");
  const ogTitle = metaContent(html, "property", "og:title");
  const ogDesc = metaContent(html, "property", "og:description");
  const ogImage = metaContent(html, "property", "og:image");
  const twitterCard = metaContent(html, "name", "twitter:card");
  const viewport = metaContent(html, "name", "viewport");
  const robotsMeta = metaContent(html, "name", "robots");
  const charset =
    html.match(/<meta[^>]+charset=["']?([a-zA-Z0-9\-]+)["']?/i)?.[1] ??
    html.match(/charset=([a-zA-Z0-9\-]+)/i)?.[1];
  const lang = html.match(/<html[^>]+lang=["']?([a-zA-Z\-]+)["']?/i)?.[1];
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1];
  const hasFavicon = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["'][^"']+["']/i.test(html);
  const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim()
  );
  const imgTags = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0]);
  const totalImgs = imgTags.length;
  const imgsWithAlt = imgTags.filter((t) => /\balt=/i.test(t)).length;
  const wordCount = estimateWordCount(html);
  const isIndexable = !robotsMeta || !/noindex/i.test(robotsMeta);
  const ogComplete = !!(ogTitle && ogDesc && ogImage);
  const imgAltRatio = totalImgs === 0 ? 1 : imgsWithAlt / totalImgs;
  const titleLen = title?.length ?? 0;
  const descLen = metaDesc?.length ?? 0;

  const missingOg: string[] = [];
  if (!ogTitle) missingOg.push("og:title");
  if (!ogDesc) missingOg.push("og:description");
  if (!ogImage) missingOg.push("og:image");

  const checks: SeoCheck[] = [
    {
      id: "title_present",
      label: "Title tag",
      passed: !!title,
      value: title,
      tip: !title ? "Add a <title> tag — critical for SEO and browser tabs." : undefined,
      impact: "high",
      points: title ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "title_length",
      label: "Title length (50–60 chars)",
      passed: titleLen >= 50 && titleLen <= 60,
      value: `${titleLen} chars`,
      tip: titleLen > 0 && (titleLen < 50 || titleLen > 60) ? `Aim for 50–60 characters. Current: ${titleLen}.` : undefined,
      impact: "medium",
      points: titleLen >= 50 && titleLen <= 60 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "meta_desc_present",
      label: "Meta description",
      passed: !!metaDesc,
      value: metaDesc,
      tip: !metaDesc ? 'Add <meta name="description"> — shown in Google search results.' : undefined,
      impact: "high",
      points: metaDesc ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "meta_desc_length",
      label: "Meta description length (120–160 chars)",
      passed: descLen >= 120 && descLen <= 160,
      value: `${descLen} chars`,
      tip: descLen > 0 && (descLen < 120 || descLen > 160) ? `Aim for 120–160 characters. Current: ${descLen}.` : undefined,
      impact: "medium",
      points: descLen >= 120 && descLen <= 160 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "h1_present",
      label: "H1 heading",
      passed: h1s.length > 0,
      value: h1s[0],
      tip: h1s.length === 0 ? "Add a single <h1> that describes the main topic of the page." : undefined,
      impact: "high",
      points: h1s.length > 0 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "h1_single",
      label: "Single H1",
      passed: h1s.length === 1,
      value: `${h1s.length} H1${h1s.length !== 1 ? "s" : ""} found`,
      tip: h1s.length > 1 ? `Multiple H1s found (${h1s.length}). Use only one per page.` : undefined,
      impact: "medium",
      points: h1s.length === 1 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "canonical",
      label: "Canonical URL",
      passed: !!canonical,
      value: canonical,
      tip: !canonical ? 'Add <link rel="canonical"> to avoid duplicate content penalties.' : undefined,
      impact: "high",
      points: canonical ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "viewport",
      label: "Viewport meta",
      passed: !!viewport,
      value: viewport,
      tip: !viewport ? 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' : undefined,
      impact: "high",
      points: viewport ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "lang",
      label: "Language attribute",
      passed: !!lang,
      value: lang,
      tip: !lang ? 'Add lang attribute to <html>, e.g. <html lang="es">.' : undefined,
      impact: "medium",
      points: lang ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "charset",
      label: "Charset declaration",
      passed: !!charset,
      value: charset,
      tip: !charset ? "Add <meta charset=\"UTF-8\"> inside <head>." : undefined,
      impact: "low",
      points: charset ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "robots",
      label: "Indexable by search engines",
      passed: isIndexable,
      value: robotsMeta ?? "no restrictions",
      tip: !isIndexable ? "Remove 'noindex' from robots meta to allow search engine indexing." : undefined,
      impact: "high",
      points: isIndexable ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "og_tags",
      label: "Open Graph tags",
      passed: ogComplete,
      value: ogComplete ? "Complete (title + description + image)" : `Missing: ${missingOg.join(", ")}`,
      tip: !ogComplete ? "Add og:title, og:description and og:image for better sharing on social media." : undefined,
      impact: "medium",
      points: ogComplete ? 10 : 0,
      maxPoints: 10,
    },
    {
      id: "twitter_card",
      label: "Twitter/X card",
      passed: !!twitterCard,
      value: twitterCard,
      tip: !twitterCard ? 'Add <meta name="twitter:card" content="summary_large_image">.' : undefined,
      impact: "low",
      points: twitterCard ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "json_ld",
      label: "Structured data (JSON-LD)",
      passed: hasJsonLd,
      tip: !hasJsonLd ? "Add JSON-LD schema markup to help search engines understand your content." : undefined,
      impact: "medium",
      points: hasJsonLd ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "favicon",
      label: "Favicon",
      passed: hasFavicon,
      tip: !hasFavicon ? 'Add <link rel="icon" href="/favicon.ico"> for browser tab branding.' : undefined,
      impact: "low",
      points: hasFavicon ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "images_alt",
      label: "Images with alt text",
      passed: imgAltRatio >= 0.9,
      value: totalImgs > 0 ? `${imgsWithAlt}/${totalImgs} images` : "No images",
      tip:
        totalImgs > 0 && imgAltRatio < 0.9
          ? `${totalImgs - imgsWithAlt} image(s) missing alt attribute — needed for accessibility and image SEO.`
          : undefined,
      impact: "medium",
      points: imgAltRatio >= 0.9 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "word_count",
      label: "Content depth (300+ words)",
      passed: wordCount >= 300,
      value: `~${wordCount} words`,
      tip: wordCount < 300 ? "Pages with 300+ words of quality content tend to rank better." : undefined,
      impact: "low",
      points: wordCount >= 300 ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "robots_txt",
      label: "robots.txt present",
      passed: hasRobots,
      tip: !hasRobots ? "Create /robots.txt to guide search engine crawlers." : undefined,
      impact: "medium",
      points: hasRobots ? 5 : 0,
      maxPoints: 5,
    },
    {
      id: "sitemap",
      label: "XML sitemap",
      passed: hasSitemap,
      tip: !hasSitemap ? "Create /sitemap.xml and submit it to Google Search Console." : undefined,
      impact: "medium",
      points: hasSitemap ? 5 : 0,
      maxPoints: 5,
    },
  ];

  const score = checks.reduce((acc, c) => acc + c.points, 0);

  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const quickWins = checks
    .filter((c) => !c.passed)
    .sort(
      (a, b) =>
        (impactOrder[a.impact] ?? 2) - (impactOrder[b.impact] ?? 2) ||
        b.maxPoints - a.maxPoints
    )
    .slice(0, 3);

  const cacheHeader = headers["cache-control"] ?? "";
  const xCache = headers["x-cache"] ?? "";
  const altSvc = headers["alt-svc"] ?? "";
  const xfo = (headers["x-frame-options"] ?? "").toLowerCase();
  const cspHeader = (headers["content-security-policy"] ?? "").toLowerCase();
  const frameable = !xfo.includes("deny") && !xfo.includes("sameorigin") && !cspHeader.includes("frame-ancestors");

  const isHttpsUrl = url.startsWith("https:");
  const httpSrcMatches = isHttpsUrl
    ? [...html.matchAll(/(?:src|href)=["'](http:\/\/[^"']{4,200})["']/gi)]
    : [];
  const mixedUrls = httpSrcMatches.slice(0, 5).map((m) => m[1]);

  const jsonLdBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const ldTypes: string[] = [];
  for (const block of jsonLdBlocks) {
    try {
      const collectTypes = (o: unknown): void => {
        if (!o || typeof o !== "object") return;
        if (Array.isArray(o)) { o.forEach(collectTypes); return; }
        const t = (o as Record<string, unknown>)["@type"];
        if (typeof t === "string") ldTypes.push(t);
        else if (Array.isArray(t)) t.filter((x): x is string => typeof x === "string").forEach((x) => ldTypes.push(x));
        Object.values(o as Record<string, unknown>).forEach(collectTypes);
      };
      collectTypes(JSON.parse(block[1]) as unknown);
    } catch { /* */ }
  }

  const inputTags = [...html.matchAll(/<input[^>]*>/gi)].map((m) => m[0]);
  const formInputs = inputTags.filter((t) => !/\btype=["'](?:hidden|submit|button|image|reset)["']/i.test(t));
  const inputsWithoutLabel = formInputs.filter((t) => !/\baria-label|\baria-labelledby/i.test(t)).length;
  const hasSkipLink = /<a[^>]+href=["']#(?:main|content|skip|maincontent)/i.test(html.slice(0, 1500));

  const hreflangs = [...html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]*/gi)]
    .map((m) => m[1])
    .filter(Boolean);

  return NextResponse.json({
    url,
    finalUrl: res.url,
    status: res.status,
    frameable,
    seo: { score, grade: scoreToGrade(score), checks, quickWins },
    tech: detectTech(html, headers),
    performance: {
      ttfb,
      totalMs,
      contentSize: rawText.length,
      compressed: /gzip|br|deflate/.test(headers["content-encoding"] ?? ""),
      cached: /HIT/.test(xCache) || cacheHeader.includes("max-age"),
      http2: altSvc.includes("h2") || altSvc.includes("h3"),
    },
    mixedContent: { total: httpSrcMatches.length, urls: mixedUrls },
    structuredData: { types: [...new Set(ldTypes)], count: jsonLdBlocks.length },
    a11y: { imagesWithoutAlt: totalImgs - imgsWithAlt, inputsWithoutLabel, hasSkipLink },
    hreflangs: [...new Set(hreflangs)],
  } satisfies PageResult);
}
