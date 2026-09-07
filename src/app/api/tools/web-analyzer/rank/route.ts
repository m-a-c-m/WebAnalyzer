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

export interface RankResult {
  domain: string;
  available: boolean;
  pageRankInteger?: number;
  pageRankDecimal?: number;
  globalRank?: string;
}

interface OprResponse {
  status_code?: number;
  response?: Array<{
    status_code?: number;
    page_rank_integer?: number;
    page_rank_decimal?: number;
    rank?: string;
    domain?: string;
  }>;
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
  const apiKey = process.env.OPEN_PAGERANK_KEY;

  if (!apiKey) {
    return NextResponse.json({ domain, available: false } satisfies RankResult);
  }

  try {
    const res = await fetch(
      `https://openpagerank.com/api/v1.0/getPageRank?domains%5B0%5D=${encodeURIComponent(domain)}`,
      {
        headers: {
          "API-OPR": apiKey,
          "User-Agent": "miguelacm.es/web-analyzer",
        },
        signal: AbortSignal.timeout(8_000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ domain, available: false } satisfies RankResult);
    }

    const data = (await res.json()) as OprResponse;
    const entry = data.response?.[0];

    if (!entry || entry.status_code !== 200) {
      return NextResponse.json({ domain, available: false } satisfies RankResult);
    }

    return NextResponse.json({
      domain,
      available: true,
      pageRankInteger: entry.page_rank_integer,
      pageRankDecimal: entry.page_rank_decimal,
      globalRank: entry.rank,
    } satisfies RankResult);
  } catch {
    return NextResponse.json({ domain, available: false } satisfies RankResult);
  }
}
