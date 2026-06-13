import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 10;
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
  url: z.string().url().max(2000).refine((v) => !BLOCKED.test(v), "Blocked"),
});

export interface CarbonResult {
  url: string;
  failed?: boolean;
  green?: boolean;
  bytes?: number;
  cleanerThan?: number;
  co2Grams?: number;
  rating?: string;
}

interface CarbonApiResponse {
  url?: string;
  green?: boolean;
  bytes?: number;
  cleanerThan?: number;
  rating?: string;
  statistics?: {
    co2?: {
      grid?: { grams?: number };
    };
  };
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

  try {
    const res = await fetch(
      `https://api.websitecarbon.com/site?url=${encodeURIComponent(url)}`,
      {
        headers: { "User-Agent": "miguelacm.es/web-analyzer" },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ url, failed: true } satisfies CarbonResult, { status: 200 });
    }

    const data = (await res.json()) as CarbonApiResponse;

    return NextResponse.json({
      url,
      green: data.green,
      bytes: data.bytes,
      cleanerThan: data.cleanerThan,
      co2Grams: data.statistics?.co2?.grid?.grams,
      rating: data.rating,
    } satisfies CarbonResult);
  } catch {
    return NextResponse.json({ url, failed: true } satisfies CarbonResult);
  }
}
