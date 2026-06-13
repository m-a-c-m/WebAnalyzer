import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 5;
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

interface CrtEntry {
  name_value: string;
  common_name?: string;
  issuer_name?: string;
  not_before?: string;
  not_after?: string;
}

export interface SubdomainsResult {
  domain: string;
  subdomains: string[];
  total: number;
  ctFailed?: boolean;
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

  function parseCrtSh(entries: CrtEntry[], dom: string): string[] {
    const seen = new Set<string>();
    for (const entry of entries) {
      for (const raw of entry.name_value.split("\n")) {
        const name = raw.trim().toLowerCase();
        if (name && !name.includes("*") && name.endsWith(`.${dom}`) && name !== dom) {
          seen.add(name);
          if (seen.size >= 100) break;
        }
      }
      if (seen.size >= 100) break;
    }
    return [...seen].sort();
  }

  // Try crt.sh (with server-side deduplication for faster response)
  try {
    const res = await fetch(
      `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json&deduplicate=Y`,
      {
        headers: { "User-Agent": "miguelacm.es/web-analyzer", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as CrtEntry[];
      const subdomains = parseCrtSh(data, domain);
      return NextResponse.json({ domain, subdomains, total: subdomains.length });
    }
  } catch { /* fall through to backup */ }

  // Fallback: CertSpotter (free tier, no key required)
  try {
    const res = await fetch(
      `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`,
      {
        headers: { "User-Agent": "miguelacm.es/web-analyzer" },
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (res.ok) {
      const data = (await res.json()) as { dns_names?: string[] }[];
      const seen = new Set<string>();
      for (const entry of data) {
        for (const name of entry.dns_names ?? []) {
          const n = name.trim().toLowerCase();
          if (n && !n.includes("*") && n.endsWith(`.${domain}`) && n !== domain) {
            seen.add(n);
            if (seen.size >= 100) break;
          }
        }
        if (seen.size >= 100) break;
      }
      const subdomains = [...seen].sort();
      return NextResponse.json({ domain, subdomains, total: subdomains.length });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ domain, subdomains: [], total: 0, ctFailed: true });
}
