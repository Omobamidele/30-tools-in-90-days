// Money is integer minor units beside an ISO currency (spec NFR-2). Formatting only lives here.

export function formatMoney(minor: number, currency: string, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(minor / 100);
}

/** Summary-screen money (docs/09): "$212k", "$7,200", "$1.2M". Exact value goes in a title/aria label. */
export function formatMoneyShort(minor: number, currency: string): string {
  const major = minor / 100;
  const abs = Math.abs(major);
  const sym = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "";
  const sign = major < 0 ? "−" : "";
  if (abs >= 999_500) return `${sign}${sym}${trim(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}${sym}${trim(abs / 1000)}k`;
  return formatMoney(minor, currency);
}

const trim = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

/** Parses user money input ("7,200", "7200.50", "$7,200") into minor units, or null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[\s,$€£]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const formatInt = (n: number) => new Intl.NumberFormat("en-US").format(n);
