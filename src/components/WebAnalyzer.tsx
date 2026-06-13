"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FiSearch, FiCheckCircle, FiXCircle, FiAlertCircle,
  FiShare2, FiCopy, FiChevronDown, FiChevronUp,
  FiGlobe, FiShield, FiZap, FiLayers, FiTrendingUp,
  FiRefreshCw, FiMonitor,
} from "react-icons/fi";

interface Props {
  locale?: string;
  initialCheck?: string;
}

interface DnsRecord { name: string; type: string; value: string; ttl?: number; }
interface DnsData { domain: string; records: Record<string, DnsRecord[]>; }

interface WhoisData {
  domain: string;
  rdapFailed?: boolean;
  registrar?: string;
  createdDate?: string;
  updatedDate?: string;
  expiresDate?: string;
  status?: string[];
  nameservers?: string[];
}

interface SslData {
  domain: string; valid: boolean; issuer?: string; subject?: string;
  validFrom?: string; validTo?: string; daysRemaining?: number;
  sans?: string[]; protocol?: string; cipher?: string; grade?: string; error?: string;
}

interface RedirectHop { url: string; status: number; statusText: string; ms: number; location?: string; }
interface RedirectData { inputUrl: string; finalUrl: string; hops: number; chain: RedirectHop[]; isHttps: boolean; }

interface SeoCheck {
  id: string; label: string; passed: boolean; value?: string; tip?: string;
  impact: "high" | "medium" | "low"; points: number; maxPoints: number;
}
interface TechItem { category: string; name: string; confidence: "high" | "medium" | "low"; }
interface PageData {
  url: string; finalUrl: string; status: number;
  seo: { score: number; grade: string; checks: SeoCheck[]; quickWins: SeoCheck[]; };
  tech: TechItem[];
  performance: { ttfb: number; totalMs: number; contentSize: number; compressed: boolean; cached: boolean; http2: boolean; };
  mixedContent: { total: number; urls: string[]; };
  structuredData: { types: string[]; count: number; };
  a11y: { imagesWithoutAlt: number; inputsWithoutLabel: number; hasSkipLink: boolean; };
  hreflangs: string[];
}

interface SubdomainsData { domain: string; subdomains: string[]; total: number; ctFailed?: boolean; }

interface DkimSelector { selector: string; found: boolean; raw?: string; }
interface EmailData {
  domain: string;
  spf: { found: boolean; raw?: string; all?: string; };
  dmarc: { found: boolean; raw?: string; policy?: string; pct?: number; };
  dkim: DkimSelector[];
  verdict: "protected" | "partial" | "unprotected";
  score: number;
}

interface CrawlData {
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

interface CarbonData {
  url: string;
  green: boolean;
  bytes: number;
  cleanerThan: number;
  co2Grams: number;
  rating: string;
  failed?: boolean;
}

interface RankData {
  domain: string;
  available: boolean;
  configured?: boolean;
  pageRankInteger?: number;
  pageRankDecimal?: number;
  globalRank?: string;
}

interface Results {
  domain: string; url: string;
  dns: DnsData | null; whois: WhoisData | null; ssl: SslData | null;
  redirect: RedirectData | null; page: PageData | null;
  subdomains: SubdomainsData | null; email: EmailData | null;
  crawl: CrawlData | null; carbon: CarbonData | null; rank: RankData | null;
}

type SectionKey = "infrastructure" | "security" | "seo" | "performance" | "technology" | "crawl" | "preview";
type Status = "ok" | "warn" | "error" | "loading";
type CheckKey = "dns" | "whois" | "ssl" | "redirect" | "page" | "subdomains" | "email" | "crawl" | "carbon" | "rank";

const CHECK_LABELS: Record<CheckKey, string> = {
  dns: "DNS", whois: "WHOIS", ssl: "SSL", redirect: "Redirect",
  page: "SEO+Tech", subdomains: "Subdomains", email: "Email",
  crawl: "Crawl", carbon: "Carbon", rank: "PageRank",
};

const CHECK_TO_SECTION: Record<string, SectionKey> = {
  dns: "infrastructure", whois: "infrastructure", ssl: "infrastructure",
  redirect: "infrastructure", "dns-lookup": "infrastructure",
  "whois-lookup": "infrastructure", "ssl-checker": "infrastructure",
  "redirect-checker": "infrastructure",
  subdomains: "security", "subdomain-finder": "security",
  email: "security", "email-security": "security",
  seo: "seo", "seo-analyzer": "seo",
  tech: "technology", "tech-stack-detector": "technology",
  crawl: "crawl",
};

const HISTORY_KEY = "wa-history";

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as string[]; }
  catch { return []; }
}

function addHistory(domain: string) {
  const prev = getHistory().filter((d) => d !== domain);
  localStorage.setItem(HISTORY_KEY, JSON.stringify([domain, ...prev].slice(0, 5)));
}

function normalizeDomain(input: string): string {
  const s = input.trim();
  const withProto = s.startsWith("http") ? s : `https://${s}`;
  try { return new URL(withProto).hostname; } catch { return s; }
}

function normalizeUrl(input: string): string {
  const s = input.trim();
  return s.startsWith("http") ? s : `https://${s}`;
}

function sslGradeScore(grade?: string): number {
  const m: Record<string, number> = { "A+": 100, A: 90, B: 75, C: 60, D: 40, F: 0 };
  return grade ? (m[grade] ?? 50) : 0;
}

function perfScore(ttfb: number): number {
  if (ttfb < 300) return 100;
  if (ttfb < 600) return 85;
  if (ttfb < 1000) return 70;
  if (ttfb < 2000) return 50;
  if (ttfb < 3000) return 30;
  return 10;
}

function computeGlobal(r: Results): number {
  const seo = r.page?.seo.score ?? 50;
  const email = r.email?.score ?? 50;
  const ssl = sslGradeScore(r.ssl?.grade);
  const perf = r.page ? perfScore(r.page.performance.ttfb) : 50;
  return Math.round(seo * 0.4 + email * 0.2 + ssl * 0.2 + perf * 0.2);
}

function scoreColor(s: number): string {
  if (s >= 85) return "text-green-400";
  if (s >= 70) return "text-blue-400";
  if (s >= 55) return "text-yellow-400";
  if (s >= 40) return "text-orange-400";
  return "text-red-400";
}

function scoreGrade(s: number): string {
  if (s >= 95) return "A+";
  if (s >= 85) return "A";
  if (s >= 75) return "B";
  if (s >= 65) return "C";
  if (s >= 55) return "D";
  return "F";
}

function statusCls(s: Status): string {
  if (s === "ok") return "text-green-400 bg-green-500/10 border-green-500/30";
  if (s === "warn") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
  if (s === "error") return "text-red-400 bg-red-500/10 border-red-500/30";
  return "text-text-muted bg-surface/30 border-border/20";
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

function expiryDays(iso?: string): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function ExpiryBadge({ iso, isEs }: { iso?: string; isEs: boolean }) {
  const days = expiryDays(iso);
  if (days === null) return null;
  if (days < 0) return (
    <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-xs font-bold text-red-400">
      {isEs ? "EXPIRADO" : "EXPIRED"}
    </span>
  );
  if (days <= 30) return (
    <span className="rounded border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-xs font-bold text-red-400">
      {isEs ? `Expira en ${days}d` : `Expires in ${days}d`}
    </span>
  );
  if (days <= 90) return (
    <span className="rounded border border-orange-500/30 bg-orange-500/10 px-1.5 py-0.5 text-xs text-orange-400">
      {isEs ? `Expira en ${days}d` : `Expires in ${days}d`}
    </span>
  );
  return <span className="text-xs text-text-muted/50">{isEs ? `${days}d restantes` : `${days}d remaining`}</span>;
}

function infraStatus(r: Results): Status {
  if (!r.ssl?.valid && r.ssl?.error) return "error";
  if (r.ssl?.grade && ["D", "F"].includes(r.ssl.grade)) return "error";
  if (r.ssl?.grade === "C") return "warn";
  return "ok";
}

function secStatus(r: Results): Status {
  if (!r.email) return "loading";
  if (r.email.verdict === "unprotected") return "error";
  if (r.email.verdict === "partial") return "warn";
  return "ok";
}

function seoSt(r: Results): Status {
  if (!r.page) return "loading";
  const s = r.page.seo.score;
  if (s < 50) return "error";
  if (s < 75) return "warn";
  return "ok";
}

function perfSt(r: Results): Status {
  if (!r.page) return "loading";
  const t = r.page.performance.ttfb;
  if (t > 3000) return "error";
  if (t > 1000) return "warn";
  return "ok";
}

function crawlSt(r: Results): Status {
  if (!r.crawl) return "loading";
  if (!r.crawl.robots.exists) return "warn";
  if (!r.crawl.robots.allowsGooglebot) return "error";
  return "ok";
}

function Row({ label, value, ok, tip }: { label: string; value?: string; ok?: boolean; tip?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/10 py-1.5 last:border-0">
      <div className="flex shrink-0 items-center gap-1.5">
        {ok === true && <FiCheckCircle className="shrink-0 text-xs text-green-400" />}
        {ok === false && <FiXCircle className="shrink-0 text-xs text-red-400" />}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className="text-right">
        <span className="break-all text-xs text-text">{value ?? "—"}</span>
        {tip && <p className="mt-0.5 text-xs text-yellow-400/80">{tip}</p>}
      </div>
    </div>
  );
}

function GradeBadge({ grade }: { grade?: string }) {
  if (!grade) return <span className="text-xs text-text-muted">—</span>;
  const cls =
    grade === "A+" || grade === "A" ? "bg-green-500/15 text-green-400 border-green-500/30"
    : grade === "B" ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
    : grade === "C" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
    : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${cls}`}>
      {grade}
    </span>
  );
}

function SectionCard({
  title, icon, status, expanded, onToggle, children,
}: {
  title: string; icon: React.ReactNode; status: Status;
  expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/20 bg-surface/40">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface/60"
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg border text-sm ${statusCls(status)}`}>
            {icon}
          </span>
          <span className="text-sm font-medium text-text">{title}</span>
        </div>
        {expanded
          ? <FiChevronUp className="shrink-0 text-sm text-text-muted/50" />
          : <FiChevronDown className="shrink-0 text-sm text-text-muted/50" />
        }
      </button>
      {expanded && (
        <div className="border-t border-border/15 px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function PreviewSection({ url, isEs }: { url: string; isEs: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { setState("loading"); }, [url, reloadKey]);

  const shot = `https://image.thum.io/get/width/1280/noanimate/${url}`;
  let host = url;
  try { host = new URL(url).host; } catch { /* */ }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border/30 bg-surface/30 shadow-lg">
        <div className="flex items-center gap-2 border-b border-border/20 bg-surface/50 px-3 py-2">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/60" />
          </span>
          <span className="ml-1 flex-1 truncate rounded-md bg-surface/60 px-2.5 py-1 text-center text-xs text-text-muted/70">
            {host}
          </span>
        </div>
        <div className="relative min-h-[200px] bg-surface/10">
          {state === "loading" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              <p className="text-xs text-text-muted/50">{isEs ? "Generando captura…" : "Capturing…"}</p>
            </div>
          )}
          {state === "error" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-sm font-medium text-text-muted">{isEs ? "No se pudo generar la captura" : "Could not capture"}</p>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {isEs ? "Reintentar" : "Retry"}
              </button>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${reloadKey}`}
              src={shot}
              alt={`Preview of ${url}`}
              className={`block w-full h-auto transition-opacity duration-500 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setState("loaded")}
              onError={() => setState("error")}
            />
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-text-muted/40">
        {isEs
          ? "Captura real de la página pública (vía thum.io). La primera carga puede tardar unos segundos. No almacenamos nada."
          : "Real screenshot of the public page (via thum.io). First load may take a few seconds. We store nothing."}
      </p>
    </div>
  );
}

export default function WebAnalyzer({ locale = "es", initialCheck }: Props) {
  const isEs = locale === "es";

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const analyze = useCallback(async (inputValue: string) => {
    const domain = normalizeDomain(inputValue);
    const url = normalizeUrl(inputValue);
    if (!domain) return;

    setLoading(true);
    setCompleted(new Set());
    setError("");
    setResults({ domain, url, dns: null, whois: null, ssl: null, redirect: null, page: null, subdomains: null, email: null, crawl: null, carbon: null, rank: null });

    addHistory(domain);
    setHistory(getHistory());

    const markDone = (key: string) => setCompleted((prev) => new Set([...prev, key]));

    const get = async (endpoint: string): Promise<unknown> => {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
      const data = (await res.json()) as unknown;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      return data;
    };

    const set = <K extends keyof Results>(key: K, value: Results[K]) =>
      setResults((prev) => (prev ? { ...prev, [key]: value } : null));

    await Promise.allSettled([
      get(`/api/tools/web-analyzer/dns?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("dns", d as DnsData)).catch(() => set("dns", null)).finally(() => markDone("dns")),
      get(`/api/tools/web-analyzer/whois?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("whois", d as WhoisData)).catch(() => set("whois", null)).finally(() => markDone("whois")),
      get(`/api/tools/web-analyzer/ssl?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("ssl", d as SslData)).catch(() => set("ssl", null)).finally(() => markDone("ssl")),
      get(`/api/tools/web-analyzer/redirect?url=${encodeURIComponent(url)}`)
        .then((d) => set("redirect", d as RedirectData)).catch(() => set("redirect", null)).finally(() => markDone("redirect")),
      get(`/api/tools/web-analyzer/page?url=${encodeURIComponent(url)}`)
        .then((d) => set("page", d as PageData)).catch(() => set("page", null)).finally(() => markDone("page")),
      get(`/api/tools/web-analyzer/subdomains?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("subdomains", d as SubdomainsData)).catch(() => set("subdomains", null)).finally(() => markDone("subdomains")),
      get(`/api/tools/web-analyzer/email?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("email", d as EmailData)).catch(() => set("email", null)).finally(() => markDone("email")),
      get(`/api/tools/web-analyzer/crawl?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("crawl", d as CrawlData)).catch(() => set("crawl", null)).finally(() => markDone("crawl")),
      get(`/api/tools/web-analyzer/carbon?url=${encodeURIComponent(url)}`)
        .then((d) => set("carbon", d as CarbonData)).catch(() => set("carbon", null)).finally(() => markDone("carbon")),
      get(`/api/tools/web-analyzer/rank?domain=${encodeURIComponent(domain)}`)
        .then((d) => set("rank", d as RankData)).catch(() => set("rank", null)).finally(() => markDone("rank")),
    ]);

    setLoading(false);
    setExpanded(new Set(["infrastructure", "security", "seo", "performance", "technology", "crawl", "preview"]));
  }, []);

  useEffect(() => {
    try { setHistory(getHistory()); } catch { /* */ }
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("url") ?? sp.get("domain");
    if (p) { setInput(p); analyze(p); }
  }, [analyze]);

  useEffect(() => {
    if (initialCheck) {
      const section = CHECK_TO_SECTION[initialCheck];
      if (section) setExpanded((prev) => new Set([...prev, section]));
    }
  }, [initialCheck]);

  const progress = Math.round((completed.size / 10) * 100);
  const globalScore = results && !loading ? computeGlobal(results) : null;

  const toggle = (s: SectionKey) =>
    setExpanded((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  async function handleShare() {
    if (!results || globalScore === null) return;
    const text = `${results.domain}: ${globalScore}/100 (${scoreGrade(globalScore)})\nhttps://miguelacm.es/tools/web-analyzer?url=${results.domain}`;
    try {
      if (navigator.share) { await navigator.share({ title: `Análisis ${results.domain}`, text }); return; }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  }

  const sMap: Record<SectionKey, Status> = results
    ? {
        infrastructure: infraStatus(results),
        security: secStatus(results),
        seo: seoSt(results),
        performance: perfSt(results),
        technology: "ok",
        crawl: crawlSt(results),
        preview: "ok",
      }
    : { infrastructure: "loading", security: "loading", seo: "loading", performance: "loading", technology: "loading", crawl: "loading", preview: "loading" };

  const secLabels: Record<SectionKey, [string, string]> = {
    infrastructure: ["Infraestructura", "Infrastructure"],
    security: ["Seguridad", "Security"],
    seo: ["SEO", "SEO"],
    performance: ["Rendimiento", "Performance"],
    technology: ["Tecnología", "Technology"],
    crawl: ["Rastreo", "Crawlability"],
    preview: ["Vista previa", "Preview"],
  };

  const getFeaturedBlock = () => {
    if (!initialCheck || !results) return null;
    const keyMap: Record<string, string> = {
      "dns-lookup": "dns", "whois-lookup": "whois", "ssl-checker": "ssl",
      "redirect-checker": "redirect", "subdomain-finder": "subdomains",
      "email-security": "email", "seo-analyzer": "seo", "tech-stack-detector": "tech",
    };
    const key = keyMap[initialCheck] ?? initialCheck;
    const wrap = "rounded-xl border border-primary/20 bg-primary/5 p-4";
    const hdrEl = (label: string) => (
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
    );
    const skeletonEl = (
      <div className={`${wrap} space-y-2`}>
        <div className="h-3 w-32 animate-pulse rounded bg-primary/15" />
        <div className="h-2 w-full animate-pulse rounded bg-surface/60" />
        <div className="h-2 w-4/5 animate-pulse rounded bg-surface/60" />
      </div>
    );

    if (key === "dns") {
      if (!results.dns) return loading ? skeletonEl : null;
      return (
        <div className={wrap}>
          {hdrEl(isEs ? `Registros DNS — ${results.dns.domain}` : `DNS Records — ${results.dns.domain}`)}
          {Object.keys(results.dns.records).length > 0
            ? Object.entries(results.dns.records).map(([type, recs]) => (
                <div key={type} className="mb-3 last:mb-0">
                  <span className="mb-1 inline-block rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">{type}</span>
                  {recs.slice(0, 5).map((r, i) => (
                    <p key={i} className="break-all pl-3 font-mono text-xs text-text-muted">{r.value}</p>
                  ))}
                  {recs.length > 5 && <p className="pl-3 text-xs text-text-muted/40">+{recs.length - 5} more</p>}
                </div>
              ))
            : <p className="text-xs text-text-muted/50">{isEs ? "Sin registros encontrados." : "No records found."}</p>
          }
        </div>
      );
    }

    if (key === "whois") {
      if (!results.whois) return loading ? skeletonEl : null;
      const w = results.whois;
      return (
        <div className={wrap}>
          {hdrEl(`WHOIS — ${w.domain}`)}
          {w.rdapFailed
            ? <p className="text-xs text-text-muted/50">{isEs ? "Datos WHOIS no disponibles desde este servidor." : "WHOIS data unavailable from this server."}</p>
            : <>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {([
                    [isEs ? "Registrador" : "Registrar", w.registrar ?? "—"],
                    [isEs ? "Creado" : "Created", fmtDate(w.createdDate)],
                    [isEs ? "Expira" : "Expires", fmtDate(w.expiresDate)],
                    ["Status", w.status?.[0] ?? "—"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs text-text-muted/60">{label}</p>
                      <p className="truncate text-xs font-medium text-text">{value}</p>
                    </div>
                  ))}
                </div>
                {w.expiresDate && (
                  <div className="mt-2 flex items-center gap-2">
                    <ExpiryBadge iso={w.expiresDate} isEs={isEs} />
                  </div>
                )}
                {(w.nameservers?.length ?? 0) > 0 && (
                  <div className="mt-2 border-t border-border/10 pt-2">
                    <p className="mb-0.5 text-xs text-text-muted/60">Nameservers</p>
                    <p className="font-mono text-xs text-text-muted">{w.nameservers!.slice(0, 3).join(" · ")}</p>
                  </div>
                )}
              </>
          }
        </div>
      );
    }

    if (key === "ssl") {
      if (!results.ssl) return loading ? skeletonEl : null;
      const ssl = results.ssl;
      return (
        <div className={`${wrap} flex gap-4`}>
          <div className="flex shrink-0 flex-col items-center justify-start gap-1 pt-0.5">
            <GradeBadge grade={ssl.grade} />
            <p className="text-xs text-text-muted/50">SSL</p>
          </div>
          <div className="min-w-0 flex-1">
            {hdrEl(isEs ? "Certificado SSL/TLS" : "SSL/TLS Certificate")}
            <Row label={isEs ? "Válido" : "Valid"} ok={ssl.valid} value={ssl.valid ? (isEs ? "Sí" : "Yes") : `No — ${ssl.error ?? ""}`} />
            <Row label={isEs ? "Emisor" : "Issuer"} value={ssl.issuer} />
            <Row label={isEs ? "Expira" : "Expires"} value={fmtDate(ssl.validTo)} />
            {ssl.daysRemaining !== undefined && (
              <Row label={isEs ? "Días restantes" : "Days remaining"} value={`${ssl.daysRemaining}`} ok={ssl.daysRemaining > 30} />
            )}
            <Row label="Protocolo" value={ssl.protocol} />
          </div>
        </div>
      );
    }

    if (key === "redirect") {
      if (!results.redirect) return loading ? skeletonEl : null;
      const rd = results.redirect;
      return (
        <div className={wrap}>
          {hdrEl(isEs ? "Cadena de redirecciones" : "Redirect chain")}
          {rd.chain.map((hop, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-border/10 py-1.5 last:border-0">
              <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${hop.status < 300 ? "bg-green-500/15 text-green-400" : hop.status < 400 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400"}`}>
                {hop.status}
              </span>
              <span className="flex-1 truncate text-xs text-text-muted">{hop.url}</span>
              <span className="shrink-0 text-xs text-text-muted/40">{hop.ms}ms</span>
            </div>
          ))}
          <div className="mt-2 flex gap-4 text-xs">
            <span className="text-text-muted">{isEs ? `${rd.hops} salto${rd.hops !== 1 ? "s" : ""}` : `${rd.hops} hop${rd.hops !== 1 ? "s" : ""}`}</span>
            <span className={rd.isHttps ? "text-green-400" : "text-red-400"}>
              {rd.isHttps ? (isEs ? "✓ HTTPS activo" : "✓ HTTPS active") : (isEs ? "✗ Sin redirección HTTPS" : "✗ No HTTPS redirect")}
            </span>
          </div>
        </div>
      );
    }

    if (key === "subdomains") {
      if (!results.subdomains) return loading ? skeletonEl : null;
      const sub = results.subdomains;
      return (
        <div className={`${wrap} space-y-2`}>
          {hdrEl(isEs
            ? `Subdominios (CT logs) — ${sub.ctFailed ? "no disponible" : `${sub.total} encontrados`}`
            : `Subdomains (CT logs) — ${sub.ctFailed ? "unavailable" : `${sub.total} found`}`
          )}
          {sub.ctFailed
            ? <p className="text-xs text-text-muted/50">{isEs ? "No se pudo consultar crt.sh ni CertSpotter. Inténtalo de nuevo." : "Could not query crt.sh or CertSpotter. Try again."}</p>
            : sub.subdomains.length > 0
              ? <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {sub.subdomains.map((s) => (
                    <span key={s} className="rounded-md border border-border/20 bg-surface/40 px-1.5 py-0.5 font-mono text-xs text-text-muted">{s}</span>
                  ))}
                </div>
              : <p className="text-xs text-text-muted/50">{isEs ? "No se encontraron subdominios en CT logs." : "No subdomains found in CT logs."}</p>
          }
          <p className="text-xs text-text-muted/40">
            {isEs
              ? "Solo muestra subdominios con certificado SSL emitido (CT logs). No detecta subdominios sin SSL ni internos."
              : "Only shows subdomains with an issued SSL certificate (CT logs). Internal or non-SSL subdomains are not detected."}
          </p>
        </div>
      );
    }

    if (key === "email") {
      if (!results.email) return loading ? skeletonEl : null;
      const em = results.email;
      return (
        <div className={wrap}>
          {hdrEl(isEs ? "Seguridad del email" : "Email security")}
          <div className={`mb-3 rounded-lg border px-3 py-2 text-sm font-medium ${
            em.verdict === "protected" ? "border-green-500/30 bg-green-500/10 text-green-400"
            : em.verdict === "partial" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
            : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}>
            {em.verdict === "protected" ? (isEs ? "✓ Protegido contra spoofing" : "✓ Protected against spoofing")
              : em.verdict === "partial" ? (isEs ? "⚠ Protección parcial" : "⚠ Partial protection")
              : (isEs ? "✗ Vulnerable a email spoofing" : "✗ Vulnerable to email spoofing")}
          </div>
          <Row label="SPF" ok={em.spf.found} value={em.spf.found ? (em.spf.all ? `all: ${em.spf.all}` : "present") : (isEs ? "No encontrado" : "Not found")} />
          <Row label="DMARC" ok={em.dmarc.found} value={em.dmarc.found ? (em.dmarc.policy ? `p=${em.dmarc.policy}` : "present") : (isEs ? "No encontrado" : "Not found")} />
          <Row label="DKIM" ok={em.dkim.some((d) => d.found)} value={em.dkim.filter((d) => d.found).map((d) => d.selector).join(", ") || (isEs ? "No encontrado" : "Not found")} />
        </div>
      );
    }

    if (key === "seo") {
      if (!results.page) return loading ? skeletonEl : null;
      const seo = results.page.seo;
      return (
        <div className={wrap}>
          {hdrEl(`SEO — ${seo.score}/100 (${seo.grade})`)}
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface/60">
            <div
              className={`h-full rounded-full transition-all duration-500 ${seo.score >= 75 ? "bg-green-500" : seo.score >= 55 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${seo.score}%` }}
            />
          </div>
          <div className="space-y-0">
            {seo.checks.map((check) => (
              <div key={check.id} className="flex items-start gap-1.5 border-b border-border/10 py-1.5 last:border-0">
                {check.passed
                  ? <FiCheckCircle className="mt-0.5 shrink-0 text-xs text-green-400" />
                  : <FiXCircle className="mt-0.5 shrink-0 text-xs text-red-400" />
                }
                <div className="flex-1">
                  <p className="text-xs text-text">{check.label}</p>
                  {!check.passed && check.tip && <p className="mt-0.5 text-xs text-yellow-400/80">{check.tip}</p>}
                </div>
                <span className="shrink-0 text-xs text-text-muted/60">{check.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (key === "tech") {
      if (!results.page) return loading ? skeletonEl : null;
      const tech = results.page.tech;
      const catLabel: Record<string, [string, string]> = {
        server: ["Servidor", "Server"], cdn: ["CDN", "CDN"], hosting: ["Hosting", "Hosting"],
        framework: ["Framework", "Framework"], cms: ["CMS / Plataforma", "CMS / Platform"],
        analytics: ["Analytics", "Analytics"], library: ["Librerías", "Libraries"],
        language: ["Lenguaje", "Language"], payment: ["Pagos", "Payment"],
        security: ["Seguridad", "Security"],
      };
      if (tech.length === 0) return (
        <div className={wrap}>
          {hdrEl(isEs ? "Tecnología detectada" : "Detected technology")}
          <p className="text-xs text-text-muted/50">{isEs ? "No se detectó tecnología específica." : "No specific technology detected."}</p>
        </div>
      );
      const grouped = tech.reduce<Record<string, typeof tech>>((acc, t) => {
        (acc[t.category] = acc[t.category] ?? []).push(t);
        return acc;
      }, {});
      return (
        <div className={wrap}>
          {hdrEl(isEs ? `Tecnología detectada — ${tech.length} tecnologías` : `Detected technology — ${tech.length} technologies`)}
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="mb-1.5 text-xs text-text-muted/60">{(catLabel[cat] ?? [cat, cat])[isEs ? 0 : 1]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((t) => (
                    <span key={t.name} className="rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">{t.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-5">
      {/* Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <FiGlobe className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted/50" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && input.trim() && analyze(input)}
            placeholder={isEs ? "ejemplo.com o https://ejemplo.com" : "example.com or https://example.com"}
            className="w-full rounded-xl border border-border/30 bg-surface/60 py-3 pl-9 pr-4 text-sm text-text placeholder:text-text-muted/40 outline-none transition-colors focus:border-primary/50 focus:bg-surface/80"
          />
        </div>
        <button
          onClick={() => analyze(input)}
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
        >
          <FiSearch className="shrink-0" />
          <span className="hidden sm:inline">
            {loading ? (isEs ? "Analizando…" : "Analyzing…") : (isEs ? "Analizar" : "Analyze")}
          </span>
        </button>
      </div>

      {/* History */}
      {!results && !loading && history.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h) => (
            <button
              key={h}
              onClick={() => { setInput(h); analyze(h); }}
              className="rounded-lg border border-border/20 bg-surface/40 px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-primary/30 hover:text-primary"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <FiAlertCircle className="shrink-0" />
          {error}
        </div>
      )}

      {/* Progress */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{isEs ? "Analizando…" : "Analyzing…"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-border/20 bg-surface/60">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(CHECK_LABELS) as [CheckKey, string][]).map(([key, label]) => (
              <span
                key={key}
                className={`rounded-md border px-2 py-0.5 text-xs ${completed.has(key) ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-border/20 bg-surface/30 text-text-muted"}`}
              >
                {completed.has(key) ? "✓" : "⟳"} {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-4">
            {getFeaturedBlock()}

            {/* Score header */}
            {!loading && globalScore !== null && (
              <div className="flex items-center justify-between rounded-xl border border-border/20 bg-surface/40 p-4">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(results.domain)}&sz=64`}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-lg border border-border/20 bg-surface/60 p-1"
                    loading="lazy"
                  />
                  <div>
                    <p className="mb-1 text-xs text-text-muted">{results.domain}</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-4xl font-bold tabular-nums ${scoreColor(globalScore)}`}>{globalScore}</span>
                      <span className="text-lg text-text-muted">/100</span>
                      <GradeBadge grade={scoreGrade(globalScore)} />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 rounded-lg border border-border/25 bg-surface/50 px-3 py-2 text-xs text-text-muted transition-colors hover:border-primary/30 hover:text-primary"
                >
                  {copied ? <FiCopy /> : <FiShare2 />}
                  <span className="hidden sm:inline">{copied ? (isEs ? "Copiado" : "Copied") : (isEs ? "Compartir" : "Share")}</span>
                </button>
              </div>
            )}

            {/* Quick wins */}
            {!loading && (results.page?.seo.quickWins?.length ?? 0) > 0 && (
              <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/5 p-4">
                <p className="mb-2 text-sm font-semibold text-yellow-400">
                  {isEs ? "⚡ Quick wins — mejoras de alto impacto" : "⚡ Quick wins — high-impact fixes"}
                </p>
                <ol className="space-y-1.5">
                  {results.page!.seo.quickWins.map((w, i) => (
                    <li key={w.id} className="flex items-start gap-2 text-xs">
                      <span className="shrink-0 font-bold text-yellow-400">{i + 1}.</span>
                      <span>
                        <span className="font-medium text-text">{w.label}</span>
                        {w.tip && <span className="text-text-muted"> — {w.tip}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Section pills */}
            <div className="flex flex-wrap gap-2">
              {(["infrastructure", "security", "seo", "performance", "technology", "crawl", "preview"] as SectionKey[]).map((s) => (
                <button
                  key={s}
                  onClick={() => toggle(s)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${statusCls(sMap[s])}`}
                >
                  {isEs ? secLabels[s][0] : secLabels[s][1]}
                </button>
              ))}
            </div>

            {/* Sections */}
            <div className="space-y-3">
              {/* Infrastructure */}
              <SectionCard title={isEs ? "Infraestructura" : "Infrastructure"} icon={<FiGlobe />} status={sMap.infrastructure} expanded={expanded.has("infrastructure")} onToggle={() => toggle("infrastructure")}>
                {results.rank && results.rank.configured && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {isEs ? "Autoridad del dominio" : "Domain authority"}
                    </p>
                    {results.rank.available ? (
                      <>
                        <div className="mb-2 flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
                            {results.rank.pageRankInteger}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-text">Open PageRank</p>
                            <p className="text-xs text-text-muted/60">
                              {results.rank.pageRankDecimal?.toFixed(2)}/10
                              {results.rank.globalRank && Number.isFinite(parseInt(results.rank.globalRank)) ? ` · ${isEs ? "posición" : "rank"} #${parseInt(results.rank.globalRank).toLocaleString()}` : ""}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-text-muted/40">
                          {isEs ? "Fuente: openpagerank.com" : "Source: openpagerank.com"}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-text-muted/50">
                        {isEs
                          ? "Este dominio aún no tiene datos en Open PageRank — habitual en dominios nuevos o de bajo tráfico. La autoridad se mide por la cantidad y calidad de enlaces entrantes (backlinks)."
                          : "This domain has no Open PageRank data yet — common for new or low-traffic domains. Authority is based on the number and quality of inbound links (backlinks)."}
                      </p>
                    )}
                  </div>
                )}

                {results.dns && Object.keys(results.dns.records).length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">DNS</p>
                    {Object.entries(results.dns.records).map(([type, recs]) => (
                      <div key={type} className="mb-2">
                        <p className="mb-1 text-xs text-primary">{type}</p>
                        {recs.slice(0, 4).map((r, i) => (
                          <p key={i} className="break-all pl-2 font-mono text-xs text-text-muted">{r.value}</p>
                        ))}
                        {recs.length > 4 && <p className="pl-2 text-xs text-text-muted/40">+{recs.length - 4} more</p>}
                      </div>
                    ))}
                  </div>
                )}

                {results.whois && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">WHOIS</p>
                    {results.whois.rdapFailed ? (
                      <p className="text-xs text-text-muted/50">
                        {isEs
                          ? "No se pudieron obtener datos WHOIS (registrador RDAP no disponible desde este servidor)."
                          : "WHOIS data unavailable (RDAP registry not reachable from this server)."}
                      </p>
                    ) : (
                      <>
                        <Row label={isEs ? "Registrador" : "Registrar"} value={results.whois.registrar} />
                        <Row label={isEs ? "Creado" : "Created"} value={fmtDate(results.whois.createdDate)} />
                        <div className="flex items-center justify-between border-b border-border/10 py-1.5">
                          <span className="text-xs text-text-muted">{isEs ? "Expira" : "Expires"}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text">{fmtDate(results.whois.expiresDate)}</span>
                            <ExpiryBadge iso={results.whois.expiresDate} isEs={isEs} />
                          </div>
                        </div>
                        {(results.whois.nameservers?.length ?? 0) > 0 && (
                          <Row label="Nameservers" value={results.whois.nameservers!.slice(0, 2).join(", ")} />
                        )}
                      </>
                    )}
                  </div>
                )}

                {results.ssl && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">SSL/TLS</p>
                    <Row label={isEs ? "Válido" : "Valid"} ok={results.ssl.valid} value={results.ssl.valid ? (isEs ? "Sí" : "Yes") : (isEs ? "No — " + (results.ssl.error ?? "") : "No — " + (results.ssl.error ?? ""))} />
                    <div className="flex items-center justify-between border-b border-border/10 py-1.5">
                      <span className="text-xs text-text-muted">Grade</span>
                      <GradeBadge grade={results.ssl.grade} />
                    </div>
                    <Row label={isEs ? "Emisor" : "Issuer"} value={results.ssl.issuer} />
                    <Row label={isEs ? "Expira" : "Expires"} value={fmtDate(results.ssl.validTo)} />
                    {results.ssl.daysRemaining !== undefined && (
                      <Row label={isEs ? "Días restantes" : "Days remaining"} value={`${results.ssl.daysRemaining}`} ok={results.ssl.daysRemaining > 30} />
                    )}
                    <Row label="Protocolo" value={results.ssl.protocol} />
                  </div>
                )}

                {results.redirect && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {isEs ? "Cadena de redirecciones" : "Redirect chain"}
                    </p>
                    {results.redirect.chain.map((hop, i) => (
                      <div key={i} className="flex items-center gap-2 border-b border-border/10 py-1.5 last:border-0">
                        <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${hop.status < 300 ? "bg-green-500/15 text-green-400" : hop.status < 400 ? "bg-yellow-500/15 text-yellow-400" : "bg-red-500/15 text-red-400"}`}>
                          {hop.status}
                        </span>
                        <span className="flex-1 truncate text-xs text-text-muted">{hop.url}</span>
                        <span className="shrink-0 text-xs text-text-muted/40">{hop.ms}ms</span>
                      </div>
                    ))}
                    <div className="mt-2">
                      <Row label="HTTPS" ok={results.redirect.isHttps} value={results.redirect.isHttps ? (isEs ? "Sí" : "Yes") : (isEs ? "No — falta redirección HTTP→HTTPS" : "No — missing HTTP→HTTPS redirect")} />
                    </div>
                  </div>
                )}

                {!results.dns && !results.whois && !results.ssl && loading && (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                )}
              </SectionCard>

              {/* Security */}
              <SectionCard title={isEs ? "Seguridad" : "Security"} icon={<FiShield />} status={sMap.security} expanded={expanded.has("security")} onToggle={() => toggle("security")}>
                {results.email && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {isEs ? "Seguridad del email" : "Email security"}
                    </p>
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-sm font-medium ${
                      results.email.verdict === "protected" ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : results.email.verdict === "partial" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}>
                      {results.email.verdict === "protected"
                        ? (isEs ? "✓ Protegido contra spoofing" : "✓ Protected against spoofing")
                        : results.email.verdict === "partial"
                        ? (isEs ? "⚠ Protección parcial" : "⚠ Partial protection")
                        : (isEs ? "✗ Sin protección — vulnerable a spoofing" : "✗ Unprotected — vulnerable to spoofing")
                      }
                    </div>
                    <Row label="SPF" ok={results.email.spf.found} value={results.email.spf.found ? (results.email.spf.all ? `all: ${results.email.spf.all}` : "present") : (isEs ? "No encontrado" : "Not found")} />
                    <Row label="DMARC" ok={results.email.dmarc.found} value={results.email.dmarc.found ? (results.email.dmarc.policy ? `p=${results.email.dmarc.policy}` : "present") : (isEs ? "No encontrado" : "Not found")} />
                    <Row
                      label="DKIM"
                      ok={results.email.dkim.some((d) => d.found)}
                      value={results.email.dkim.filter((d) => d.found).map((d) => d.selector).join(", ") || (isEs ? "No encontrado" : "Not found")}
                    />
                    {!results.email.dmarc.found && (
                      <p className="mt-2 text-xs text-yellow-400/80">
                        {isEs
                          ? "💡 Añade: _dmarc TXT → v=DMARC1; p=quarantine; rua=mailto:dmarc@tudominio.com"
                          : "💡 Add: _dmarc TXT → v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"
                        }
                      </p>
                    )}
                  </div>
                )}

                {results.page && results.page.mixedContent.total > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {isEs ? "Contenido mixto" : "Mixed content"}
                    </p>
                    <p className="mb-1.5 text-xs text-red-400">
                      {isEs
                        ? `⚠ ${results.page.mixedContent.total} recurso${results.page.mixedContent.total !== 1 ? "s" : ""} HTTP en página HTTPS`
                        : `⚠ ${results.page.mixedContent.total} HTTP resource${results.page.mixedContent.total !== 1 ? "s" : ""} on HTTPS page`}
                    </p>
                    {results.page.mixedContent.urls.map((u) => (
                      <p key={u} className="truncate pl-2 font-mono text-xs text-text-muted/50">{u}</p>
                    ))}
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {results.subdomains
                      ? (isEs ? `Subdominios en CT logs (${results.subdomains.ctFailed ? "?" : results.subdomains.total})` : `CT logs subdomains (${results.subdomains.ctFailed ? "?" : results.subdomains.total})`)
                      : (isEs ? "Subdominios en CT logs" : "CT logs subdomains")
                    }
                  </p>
                  {results.subdomains ? (
                    results.subdomains.ctFailed ? (
                      <p className="text-xs text-text-muted/50">
                        {isEs
                          ? "No se pudo consultar Certificate Transparency. Inténtalo de nuevo."
                          : "Could not query Certificate Transparency. Try again."}
                      </p>
                    ) : results.subdomains.subdomains.length > 0 ? (
                      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                        {results.subdomains.subdomains.map((s) => (
                          <span key={s} className="rounded-md border border-border/20 bg-surface/30 px-1.5 py-0.5 font-mono text-xs text-text-muted">{s}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-text-muted/50">{isEs ? "No se encontraron subdominios en CT logs." : "No subdomains found in CT logs."}</p>
                    )
                  ) : loading ? (
                    <p className="text-xs text-text-muted/50">{isEs ? "Consultando CT logs…" : "Querying CT logs…"}</p>
                  ) : (
                    <p className="text-xs text-text-muted/50">{isEs ? "No se pudo consultar Certificate Transparency." : "Could not query Certificate Transparency."}</p>
                  )}
                </div>

                {!results.email && loading && (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                )}

                {results.email && results.email.verdict !== "protected" && (
                  <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-text-muted">
                    {isEs
                      ? <>¿Necesitas ayuda configurando SPF, DKIM y DMARC? <a href="/#contact" className="text-primary hover:underline">Contáctame</a></>
                      : <>Need help configuring SPF, DKIM and DMARC? <a href="/#contact" className="text-primary hover:underline">Get in touch</a></>
                    }
                  </div>
                )}
              </SectionCard>

              {/* SEO */}
              <SectionCard
                title={`SEO${results.page && !loading ? ` — ${results.page.seo.score}/100 (${results.page.seo.grade})` : ""}`}
                icon={<FiTrendingUp />}
                status={sMap.seo}
                expanded={expanded.has("seo")}
                onToggle={() => toggle("seo")}
              >
                {results.page ? (
                  <div>
                    <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-surface/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${results.page.seo.score >= 75 ? "bg-green-500" : results.page.seo.score >= 55 ? "bg-yellow-500" : "bg-red-500"}`}
                        style={{ width: `${results.page.seo.score}%` }}
                      />
                    </div>
                    <div className="space-y-0.5">
                      {results.page.seo.checks.map((check) => (
                        <div key={check.id} className="flex items-start justify-between gap-3 border-b border-border/10 py-1.5 last:border-0">
                          <div className="flex items-start gap-1.5">
                            {check.passed
                              ? <FiCheckCircle className="mt-0.5 shrink-0 text-xs text-green-400" />
                              : <FiXCircle className="mt-0.5 shrink-0 text-xs text-red-400" />
                            }
                            <div>
                              <p className="text-xs text-text">{check.label}</p>
                              {!check.passed && check.tip && (
                                <p className="mt-0.5 text-xs text-yellow-400/80">{check.tip}</p>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs text-text-muted/70">{check.value}</span>
                        </div>
                      ))}
                    </div>

                    {results.page.structuredData.count > 0 && (
                      <div className="mt-3 border-t border-border/10 pt-3">
                        <p className="mb-1.5 text-xs text-text-muted/60">
                          {isEs
                            ? `JSON-LD — ${results.page.structuredData.count} bloque${results.page.structuredData.count !== 1 ? "s" : ""}`
                            : `JSON-LD — ${results.page.structuredData.count} block${results.page.structuredData.count !== 1 ? "s" : ""}`}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {results.page.structuredData.types.map((t) => (
                            <span key={t} className="rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {results.page.hreflangs.length > 0 && (
                      <div className="mt-3 border-t border-border/10 pt-3">
                        <p className="mb-1 text-xs text-text-muted/60">hreflang</p>
                        <div className="flex flex-wrap gap-1">
                          {results.page.hreflangs.map((l) => (
                            <span key={l} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-400">{l}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(results.page.a11y.inputsWithoutLabel > 0 || !results.page.a11y.hasSkipLink) && (
                      <div className="mt-3 border-t border-border/10 pt-3">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                          {isEs ? "Accesibilidad" : "Accessibility"}
                        </p>
                        {results.page.a11y.inputsWithoutLabel > 0 && (
                          <Row
                            label={isEs ? "Inputs sin label" : "Inputs without label"}
                            ok={false}
                            value={`${results.page.a11y.inputsWithoutLabel}`}
                            tip={isEs ? "Añade aria-label o <label for> a los campos del formulario." : "Add aria-label or <label for> to form inputs."}
                          />
                        )}
                        <Row
                          label="Skip link"
                          ok={results.page.a11y.hasSkipLink}
                          value={results.page.a11y.hasSkipLink ? (isEs ? "Presente" : "Present") : (isEs ? "No encontrado" : "Not found")}
                        />
                      </div>
                    )}

                    {results.page.seo.score < 80 && (
                      <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-text-muted">
                        {isEs
                          ? <>Puedo ayudarte a mejorar el SEO técnico de tu web. <a href="/#contact" className="text-primary hover:underline">Hablemos</a></>
                          : <>I can help you improve your website&apos;s technical SEO. <a href="/#contact" className="text-primary hover:underline">Let&apos;s talk</a></>
                        }
                      </div>
                    )}
                  </div>
                ) : loading ? (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                ) : (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "No se pudo analizar la página." : "Could not analyze the page."}</p>
                )}
              </SectionCard>

              {/* Performance */}
              <SectionCard title={isEs ? "Rendimiento" : "Performance"} icon={<FiZap />} status={sMap.performance} expanded={expanded.has("performance")} onToggle={() => toggle("performance")}>
                {results.page ? (
                  <div>
                    <Row label="TTFB" value={`${results.page.performance.ttfb}ms`} ok={results.page.performance.ttfb < 800} tip={results.page.performance.ttfb > 1000 ? (isEs ? "Considera usar CDN o caché de servidor" : "Consider CDN or server-side caching") : undefined} />
                    <Row label={isEs ? "Tiempo total" : "Total time"} value={`${results.page.performance.totalMs}ms`} />
                    <Row label={isEs ? "Tamaño HTML" : "HTML size"} value={fmtSize(results.page.performance.contentSize)} />
                    <Row label={isEs ? "Compresión" : "Compression"} ok={results.page.performance.compressed} value={results.page.performance.compressed ? "gzip / br" : (isEs ? "Sin compresión detectada" : "No compression detected")} />
                    <Row label="Cache" ok={results.page.performance.cached} value={results.page.performance.cached ? (isEs ? "Configurada" : "Configured") : (isEs ? "Sin caché detectada" : "Not detected")} />
                    <Row label="HTTP/2" ok={results.page.performance.http2} value={results.page.performance.http2 ? (isEs ? "Soportado" : "Supported") : (isEs ? "No detectado vía alt-svc" : "Not detected via alt-svc")} />
                    <Row label="HTTP status" ok={results.page.status < 400} value={`${results.page.status} ${results.page.status < 400 ? "OK" : "Error"}`} />

                    {results.carbon && !results.carbon.failed && (
                      <div className="mt-3 border-t border-border/10 pt-3">
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                          {isEs ? "Huella de carbono" : "Carbon footprint"}
                        </p>
                        <Row
                          label={isEs ? "CO₂ por visita" : "CO₂ per visit"}
                          value={`${results.carbon.co2Grams.toFixed(3)}g`}
                          ok={results.carbon.co2Grams < 0.5}
                        />
                        <Row
                          label={isEs ? "Más limpio que" : "Cleaner than"}
                          value={`${Math.round(results.carbon.cleanerThan * 100)}% ${isEs ? "de webs" : "of websites"}`}
                          ok={results.carbon.cleanerThan > 0.5}
                        />
                        <Row
                          label={isEs ? "Hosting verde" : "Green hosting"}
                          ok={results.carbon.green}
                          value={results.carbon.green ? (isEs ? "Sí — energía renovable" : "Yes — renewable energy") : (isEs ? "No detectado" : "Not detected")}
                        />
                        <p className="mt-1 text-xs text-text-muted/40">
                          {isEs ? "Fuente: websitecarbon.com" : "Source: websitecarbon.com"}
                        </p>
                      </div>
                    )}
                  </div>
                ) : loading ? (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                ) : (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "No se pudo analizar la página." : "Could not analyze the page."}</p>
                )}
              </SectionCard>

              {/* Technology */}
              <SectionCard title={isEs ? "Tecnología detectada" : "Detected technology"} icon={<FiLayers />} status={sMap.technology} expanded={expanded.has("technology")} onToggle={() => toggle("technology")}>
                {results.page && results.page.tech.length > 0 ? (
                  <div>
                    {(["server", "cdn", "hosting", "framework", "cms", "analytics", "library", "language", "payment", "security"] as const).map((cat) => {
                      const techItems = results.page!.tech.filter((t) => t.category === cat);
                      if (techItems.length === 0) return null;
                      const catLabel: Record<string, [string, string]> = {
                        server: ["Servidor", "Server"],
                        cdn: ["CDN", "CDN"],
                        hosting: ["Hosting", "Hosting"],
                        framework: ["Framework", "Framework"],
                        cms: ["CMS / Plataforma", "CMS / Platform"],
                        analytics: ["Analytics", "Analytics"],
                        library: ["Librerías JS/CSS", "JS/CSS Libraries"],
                        language: ["Lenguaje", "Language"],
                        payment: ["Pasarelas de pago", "Payment"],
                        security: ["Seguridad / CAPTCHA", "Security / CAPTCHA"],
                      };
                      const label = (catLabel[cat] ?? [cat, cat])[isEs ? 0 : 1];
                      return (
                        <div key={cat} className="mb-3 last:mb-0">
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {techItems.map((t) => (
                              <span key={t.name} className="rounded-md border border-border/20 bg-surface/50 px-2 py-0.5 text-xs text-text">{t.name}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <p className="mt-3 text-xs text-text-muted/40">
                      {isEs ? `${results.page.tech.length} tecnologías detectadas · análisis pasivo de cabeceras HTTP y HTML` : `${results.page.tech.length} technologies detected · passive HTTP headers and HTML analysis`}
                    </p>
                  </div>
                ) : results.page ? (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "No se detectó tecnología específica." : "No specific technology detected."}</p>
                ) : loading ? (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                ) : (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "No se pudo analizar la página." : "Could not analyze the page."}</p>
                )}
              </SectionCard>

              {/* Preview */}
              <SectionCard title={isEs ? "Vista previa" : "Preview"} icon={<FiMonitor />} status={sMap.preview} expanded={expanded.has("preview")} onToggle={() => toggle("preview")}>
                <PreviewSection url={results.url} isEs={isEs} />
              </SectionCard>

              {/* Crawlability */}
              <SectionCard title={isEs ? "Rastreo" : "Crawlability"} icon={<FiRefreshCw />} status={sMap.crawl} expanded={expanded.has("crawl")} onToggle={() => toggle("crawl")}>
                {results.crawl ? (
                  <div>
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">robots.txt</p>
                      <Row label={isEs ? "Existe" : "Exists"} ok={results.crawl.robots.exists} value={results.crawl.robots.exists ? (isEs ? "Sí" : "Yes") : "No"} />
                      {results.crawl.robots.exists && (
                        <>
                          <Row
                            label="Googlebot"
                            ok={results.crawl.robots.allowsGooglebot}
                            value={results.crawl.robots.allowsGooglebot ? (isEs ? "Permitido" : "Allowed") : (isEs ? "Bloqueado — Disallow: /" : "Blocked — Disallow: /")}
                          />
                          {results.crawl.robots.crawlDelay !== undefined && (
                            <Row
                              label="Crawl-delay"
                              value={`${results.crawl.robots.crawlDelay}s`}
                              ok={results.crawl.robots.crawlDelay <= 10}
                              tip={results.crawl.robots.crawlDelay > 10 ? (isEs ? "Crawl-delay alto — puede reducir la indexación." : "High crawl-delay — may reduce indexing.") : undefined}
                            />
                          )}
                          {results.crawl.robots.disallowedPaths.length > 0 && (
                            <div className="mt-2">
                              <p className="mb-1 text-xs text-text-muted/60">
                                {isEs ? `${results.crawl.robots.disallowedPaths.length} ruta${results.crawl.robots.disallowedPaths.length !== 1 ? "s" : ""} bloqueada${results.crawl.robots.disallowedPaths.length !== 1 ? "s" : ""}:` : `${results.crawl.robots.disallowedPaths.length} blocked path${results.crawl.robots.disallowedPaths.length !== 1 ? "s" : ""}:`}
                              </p>
                              {results.crawl.robots.disallowedPaths.slice(0, 6).map((p) => (
                                <p key={p} className="pl-2 font-mono text-xs text-text-muted/50">{p}</p>
                              ))}
                              {results.crawl.robots.disallowedPaths.length > 6 && (
                                <p className="pl-2 text-xs text-text-muted/30">+{results.crawl.robots.disallowedPaths.length - 6} more</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">sitemap.xml</p>
                      <Row label={isEs ? "Existe" : "Exists"} ok={results.crawl.sitemap.exists} value={results.crawl.sitemap.exists ? (isEs ? "Sí" : "Yes") : "No"} />
                      {results.crawl.sitemap.exists && (
                        <>
                          {results.crawl.sitemap.isIndex
                            ? <Row label={isEs ? "Tipo" : "Type"} value={isEs ? `Sitemap index (${results.crawl.sitemap.sitemapEntries} sitemaps)` : `Sitemap index (${results.crawl.sitemap.sitemapEntries} sitemaps)`} />
                            : results.crawl.sitemap.urlCount !== null && (
                                <Row label="URLs" value={`${results.crawl.sitemap.urlCount.toLocaleString()} URLs`} ok={results.crawl.sitemap.urlCount > 0} />
                              )
                          }
                          {results.crawl.robots.sitemapUrls.length > 0 && (
                            <Row label="URL" value={results.crawl.robots.sitemapUrls[0]} />
                          )}
                        </>
                      )}
                      {!results.crawl.sitemap.exists && (
                        <p className="mt-1 text-xs text-yellow-400/80">
                          {isEs ? "💡 Crea /sitemap.xml y declárate en robots.txt con Sitemap: https://tudominio.com/sitemap.xml" : "💡 Create /sitemap.xml and declare it in robots.txt with Sitemap: https://yourdomain.com/sitemap.xml"}
                        </p>
                      )}
                    </div>
                  </div>
                ) : loading ? (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "Cargando…" : "Loading…"}</p>
                ) : (
                  <p className="py-4 text-center text-xs text-text-muted/50">{isEs ? "No se pudo analizar el rastreo." : "Could not analyze crawlability."}</p>
                )}
              </SectionCard>
            </div>

            {/* Disclaimer */}
            {!loading && (
              <p className="border-t border-border/10 pt-3 text-xs text-text-muted/50">
                {isEs
                  ? "Datos orientativos procedentes de fuentes públicas — pueden cambiar. Análisis pasivo: no almacenamos ningún dato ni realizamos escaneo intrusivo."
                  : "Indicative data from public sources — may change. Passive analysis: we store no data and perform no intrusive scanning."
                }
              </p>
            )}
        </div>
      )}
    </div>
  );
}
