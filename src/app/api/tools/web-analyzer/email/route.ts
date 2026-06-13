import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const rateLimit = new Map<string, number[]>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;
const DOH = "https://cloudflare-dns.com/dns-query";
const DKIM_SELECTORS = ["google", "mail", "dkim", "default", "k1", "s1", "s2", "smtp"] as const;
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

interface DohAnswer {
  data: string;
}

interface DohResponse {
  Answer?: DohAnswer[];
}

async function queryTxt(name: string): Promise<string[]> {
  const res = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { Accept: "application/dns-json" },
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json()) as DohResponse;
  return (data.Answer ?? []).map((a) =>
    a.data.replace(/^"/, "").replace(/"$/, "").replace(/"\s*"/g, "").trim()
  );
}

export interface SpfAnalysis {
  found: boolean;
  raw?: string;
  mechanisms?: string[];
  all?: string;
}

export interface DmarcAnalysis {
  found: boolean;
  raw?: string;
  policy?: string;
  pct?: number;
  rua?: string;
}

export interface DkimSelector {
  selector: string;
  found: boolean;
  raw?: string;
}

export interface EmailSecurityResult {
  domain: string;
  spf: SpfAnalysis;
  dmarc: DmarcAnalysis;
  dkim: DkimSelector[];
  verdict: "protected" | "partial" | "unprotected";
  score: number;
}

function parseSpf(record: string): SpfAnalysis {
  const parts = record.split(/\s+/);
  const allPart = parts.find((p) => /^[-~+?]all$/i.test(p));
  const all = allPart?.startsWith("-")
    ? "fail"
    : allPart?.startsWith("~")
    ? "softfail"
    : allPart?.startsWith("?")
    ? "neutral"
    : "pass";
  return { found: true, raw: record, mechanisms: parts.slice(1), all };
}

function parseDmarc(record: string): DmarcAnalysis {
  const policy = record.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
  const pctStr = record.match(/\bpct=(\d+)/i)?.[1];
  const rua = record.match(/\brua=([^\s;]+)/i)?.[1];
  return {
    found: true,
    raw: record,
    policy,
    pct: pctStr ? parseInt(pctStr, 10) : undefined,
    rua,
  };
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

  const allSettled = await Promise.allSettled([
    queryTxt(domain),
    queryTxt(`_dmarc.${domain}`),
    ...DKIM_SELECTORS.map((sel) => queryTxt(`${sel}._domainkey.${domain}`)),
  ]);

  const [txtSettled, dmarcSettled, ...dkimSettled] = allSettled;

  const txtList = txtSettled.status === "fulfilled" ? txtSettled.value : [];
  const spfRecord = txtList.find((r) => r.startsWith("v=spf1"));
  const spf: SpfAnalysis = spfRecord ? parseSpf(spfRecord) : { found: false };

  const dmarcList = dmarcSettled.status === "fulfilled" ? dmarcSettled.value : [];
  const dmarcRecord = dmarcList.find((r) => r.startsWith("v=DMARC1"));
  const dmarc: DmarcAnalysis = dmarcRecord ? parseDmarc(dmarcRecord) : { found: false };

  const dkim: DkimSelector[] = DKIM_SELECTORS.map((sel, i) => {
    const settled = dkimSettled[i];
    const records = settled?.status === "fulfilled" ? settled.value : [];
    const found = records.some((r) => r.includes("v=DKIM1") || r.includes("p="));
    return { selector: sel, found, raw: found ? records[0] : undefined };
  });

  const dkimFound = dkim.some((d) => d.found);

  let score = 0;
  if (spf.found) score += 30;
  if (dmarc.found) {
    score += 30;
    if (dmarc.policy === "reject") score += 20;
    else if (dmarc.policy === "quarantine") score += 10;
    else if (dmarc.policy === "none") score += 5;
  }
  if (dkimFound) score += 20;
  score = Math.min(score, 100);

  const verdict: EmailSecurityResult["verdict"] =
    spf.found && dmarc.found && dkimFound
      ? "protected"
      : spf.found || dmarc.found || dkimFound
      ? "partial"
      : "unprotected";

  return NextResponse.json({
    domain,
    spf,
    dmarc,
    dkim,
    verdict,
    score,
  } satisfies EmailSecurityResult);
}
