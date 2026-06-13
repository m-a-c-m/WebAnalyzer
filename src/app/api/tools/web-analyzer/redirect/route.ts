import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const MAX_HOPS = 10;
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

export interface RedirectHop {
  url: string;
  status: number;
  statusText: string;
  ms: number;
  location?: string;
}

export interface RedirectResult {
  inputUrl: string;
  finalUrl: string;
  hops: number;
  chain: RedirectHop[];
  isHttps: boolean;
  hasWww?: boolean;
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

  const inputUrl = parsed.data.url;
  let current = inputUrl;
  const chain: RedirectHop[] = [];

  for (let i = 0; i < MAX_HOPS; i++) {
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": "miguelacm.es/web-analyzer" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      break;
    }

    const ms = Date.now() - start;
    const location = res.headers.get("location") ?? undefined;

    chain.push({
      url: current,
      status: res.status,
      statusText: res.statusText,
      ms,
      location,
    });

    if (res.status >= 300 && res.status < 400 && location) {
      try {
        current = location.startsWith("http") ? location : new URL(location, current).toString();
      } catch {
        break;
      }
    } else {
      break;
    }
  }

  const finalUrl = chain[chain.length - 1]?.url ?? inputUrl;

  return NextResponse.json({
    inputUrl,
    finalUrl,
    hops: chain.length,
    chain,
    isHttps: finalUrl.startsWith("https://"),
  } satisfies RedirectResult);
}
