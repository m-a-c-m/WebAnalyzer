import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const DOH = "https://cloudflare-dns.com/dns-query";
const RECORD_TYPES = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"] as const;
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

export interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl?: number;
}

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Answer?: DohAnswer[];
}

async function queryType(domain: string, type: string): Promise<DnsRecord[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(domain)}&type=${type}`, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json()) as DohResponse;
  return (data.Answer ?? []).map((r) => ({
    name: r.name,
    type,
    value: r.data,
    ttl: r.TTL,
  }));
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
  const settled = await Promise.allSettled(RECORD_TYPES.map((t) => queryType(domain, t)));

  const records: Record<string, DnsRecord[]> = {};
  RECORD_TYPES.forEach((type, i) => {
    const r = settled[i];
    if (r.status === "fulfilled" && r.value.length > 0) {
      records[type] = r.value;
    }
  });

  return NextResponse.json({ domain, records });
}
