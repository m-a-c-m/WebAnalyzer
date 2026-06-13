import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0)/i;

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
  domain: z
    .string()
    .max(253)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9\-.]{0,252}[a-zA-Z0-9]$|^[a-zA-Z0-9]{1}$/, "Invalid domain")
    .refine((v) => !BLOCKED.test(v), "Blocked"),
});

export interface CrawlResult {
  domain: string;
  robots: {
    exists: boolean;
    allowsGooglebot: boolean;
    disallowedPaths: string[];
    crawlDelay?: number;
    sitemapUrls: string[];
  };
  sitemap: {
    exists: boolean;
    urlCount: number | null;
    isIndex: boolean;
    sitemapEntries: number;
  };
}

function parseRobots(text: string): {
  allowsGooglebot: boolean;
  disallowedPaths: string[];
  crawlDelay?: number;
  sitemapUrls: string[];
} {
  const lines = text.split(/\r?\n/);
  const disallowedPaths: string[] = [];
  const sitemapUrls: string[] = [];
  let crawlDelay: number | undefined;
  let allowsGooglebot = true;
  let inRelevantSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) {
      continue;
    }
    if (/^user-agent:/i.test(trimmed)) {
      const ua = trimmed.replace(/^user-agent:\s*/i, "").toLowerCase();
      inRelevantSection = ua === "*" || ua === "googlebot";
      continue;
    }
    if (/^sitemap:/i.test(trimmed)) {
      const url = trimmed.replace(/^sitemap:\s*/i, "").trim();
      if (url) sitemapUrls.push(url);
      continue;
    }
    if (!inRelevantSection) continue;
    if (/^disallow:/i.test(trimmed)) {
      const path = trimmed.replace(/^disallow:\s*/i, "").trim();
      if (path === "/") allowsGooglebot = false;
      if (path) disallowedPaths.push(path);
    } else if (/^crawl-delay:/i.test(trimmed)) {
      const val = parseInt(trimmed.replace(/^crawl-delay:\s*/i, "").trim());
      if (!isNaN(val)) crawlDelay = val;
    }
  }

  return { allowsGooglebot, disallowedPaths: disallowedPaths.slice(0, 15), crawlDelay, sitemapUrls: sitemapUrls.slice(0, 5) };
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = schema.safeParse({ domain: req.nextUrl.searchParams.get("domain") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const { domain } = parsed.data;
  const origin = `https://${domain}`;
  const ua = "miguelacm.es/web-analyzer";

  let robotsExists = false;
  let robotsParsed: { allowsGooglebot: boolean; disallowedPaths: string[]; crawlDelay?: number; sitemapUrls: string[] } = { allowsGooglebot: true, disallowedPaths: [], sitemapUrls: [] };

  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text") || ct.includes("plain")) {
        const text = await res.text();
        robotsExists = true;
        robotsParsed = parseRobots(text);
      }
    }
  } catch { /* */ }

  let sitemapExists = false;
  let urlCount: number | null = null;
  let isIndex = false;
  let sitemapEntries = 0;

  const sitemapUrl = robotsParsed.sitemapUrls[0] ?? `${origin}/sitemap.xml`;

  try {
    const res = await fetch(sitemapUrl, {
      headers: { "User-Agent": ua },
      signal: AbortSignal.timeout(7_000),
    });
    if (res.ok) {
      const xml = (await res.text()).slice(0, 300_000);
      sitemapExists = true;
      isIndex = /<sitemapindex/i.test(xml);
      if (isIndex) {
        sitemapEntries = (xml.match(/<sitemap[\s>]/gi) ?? []).length;
      } else {
        urlCount = (xml.match(/<url[\s>]/gi) ?? []).length;
      }
    }
  } catch { /* */ }

  const result: CrawlResult = {
    domain,
    robots: {
      exists: robotsExists,
      allowsGooglebot: robotsParsed.allowsGooglebot,
      disallowedPaths: robotsParsed.disallowedPaths,
      sitemapUrls: robotsParsed.sitemapUrls,
    },
    sitemap: { exists: sitemapExists, urlCount, isIndex, sitemapEntries },
  };
  if (robotsParsed.crawlDelay !== undefined) result.robots.crawlDelay = robotsParsed.crawlDelay;
  return NextResponse.json(result);
}
