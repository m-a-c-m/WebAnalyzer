import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as tls from "tls";

export const runtime = "nodejs";

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

export interface SslResult {
  domain: string;
  valid: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  sans?: string[];
  protocol?: string;
  cipher?: string;
  grade?: string;
  error?: string;
}

function gradeFromDays(days: number, authorized: boolean): string {
  if (!authorized) return "F";
  if (days > 90) return "A+";
  if (days > 30) return "A";
  if (days > 14) return "B";
  if (days > 7) return "C";
  if (days > 0) return "D";
  return "F";
}

function checkSsl(domain: string): Promise<SslResult> {
  return new Promise<SslResult>((resolve) => {
    let done = false;

    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: false,
    });

    const finish = (result: SslResult) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;

      if (!cert || !cert.subject) {
        finish({ domain, valid: false, error: "No certificate found" });
        return;
      }

      const issuer = cert.issuer as unknown as Record<string, string>;
      const subject = cert.subject as unknown as Record<string, string>;
      const issuerOrg = issuer.O || issuer.CN || "Unknown";
      const subjectCN = subject.CN || domain;

      const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
      const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
      const daysRemaining =
        validTo && !isNaN(validTo.getTime())
          ? Math.floor((validTo.getTime() - Date.now()) / 86_400_000)
          : undefined;

      const valid = authorized && daysRemaining !== undefined && daysRemaining > 0;

      const sans: string[] = cert.subjectaltname
        ? cert.subjectaltname
            .split(", ")
            .filter((s) => s.startsWith("DNS:"))
            .map((s) => s.slice(4))
        : [];

      finish({
        domain,
        valid,
        issuer: issuerOrg,
        subject: subjectCN,
        validFrom: validFrom && !isNaN(validFrom.getTime()) ? validFrom.toISOString() : undefined,
        validTo: validTo && !isNaN(validTo.getTime()) ? validTo.toISOString() : undefined,
        daysRemaining,
        sans,
        protocol: socket.getProtocol() ?? undefined,
        cipher: socket.getCipher()?.name ?? undefined,
        grade: gradeFromDays(daysRemaining ?? 0, authorized),
      });
    });

    socket.on("error", (err: Error) => {
      finish({ domain, valid: false, error: err.message });
    });

    socket.setTimeout(8_000, () => {
      finish({ domain, valid: false, error: "Connection timeout" });
    });
  });
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(getIp(req))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = schema.safeParse({ domain: req.nextUrl.searchParams.get("domain") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const result = await checkSsl(parsed.data.domain);
  return NextResponse.json(result);
}
