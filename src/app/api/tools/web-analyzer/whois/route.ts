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

export interface WhoisResult {
  domain: string;
  rdapFailed?: boolean;
  registrar?: string;
  createdDate?: string;
  updatedDate?: string;
  expiresDate?: string;
  status?: string[];
  nameservers?: string[];
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

type VcardProp = [string, Record<string, unknown>, string, string];

interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, VcardProp[]];
}

interface RdapResponse {
  status?: string[];
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: Array<{ ldhName?: string }>;
}

function extractFn(entity: RdapEntity): string | undefined {
  const props = entity.vcardArray?.[1];
  if (!props) return undefined;
  const fn = props.find(([name]) => name === "fn");
  return fn ? fn[3] : undefined;
}

async function fetchRdap(url: string): Promise<RdapResponse | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rdap+json", "User-Agent": "miguelacm.es/web-analyzer" },
      signal: AbortSignal.timeout(7_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return (await res.json()) as RdapResponse;
  } catch {
    return null;
  }
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

  const data =
    (await fetchRdap(`https://rdap.org/domain/${domain}`)) ??
    (await fetchRdap(`https://rdap.iana.org/domain/${domain}`));

  if (!data) {
    return NextResponse.json({ domain, rdapFailed: true } satisfies WhoisResult);
  }

  const getDate = (action: string) =>
    data.events?.find((e) => e.eventAction === action)?.eventDate;

  const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));

  const result: WhoisResult = {
    domain,
    registrar: registrarEntity ? extractFn(registrarEntity) : undefined,
    createdDate: getDate("registration"),
    updatedDate: getDate("last changed"),
    expiresDate: getDate("expiration"),
    status: data.status,
    nameservers: (data.nameservers ?? [])
      .map((ns) => ns.ldhName?.toLowerCase())
      .filter((ns): ns is string => !!ns),
  };

  return NextResponse.json(result);
}
