// Money is always an integer number of minor units (cents) plus an ISO currency code.
// Percentages are converted to basis points (1% = 100 bps) so every multiplication
// happens in integer BigInt arithmetic and rounds exactly once, half away from zero.

export type Minor = number;

export function assertMinor(value: number, label = "amount"): Minor {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer of minor units, got ${value}`);
  return value;
}

/** Percentage (up to 2 decimals, e.g. 22.5) → basis points (2250). */
export function pctToBps(pct: number): number {
  const bps = Math.round(pct * 100);
  if (!Number.isFinite(bps)) throw new RangeError(`Invalid percentage ${pct}`);
  return bps;
}

/** Integer division of BigInts, rounding half away from zero. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n + d / 2n) / d;
  return negative ? -q : q;
}

/** amount × pct%, rounded half away from zero to minor units. */
export function percentOf(amount: Minor, pct: number): Minor {
  return Number(divRound(BigInt(assertMinor(amount)) * BigInt(pctToBps(pct)), 10_000n));
}

/** amount × quantity (e.g. rooms × rate). Exact. */
export function times(amount: Minor, quantity: number): Minor {
  if (!Number.isSafeInteger(quantity)) throw new RangeError(`quantity must be an integer, got ${quantity}`);
  return assertMinor(amount * quantity, "product");
}

/** Weighted average rounded half away from zero, e.g. average contracted room rate. */
export function divideRound(total: Minor, by: number): Minor {
  if (by === 0) throw new RangeError("Division by zero");
  return Number(divRound(BigInt(total), BigInt(by)));
}

/** ceil(count × pct%) for integer counts, e.g. committed rooms (documented rounding rule). */
export function ceilPercentOfCount(count: number, pct: number): number {
  const n = BigInt(count) * BigInt(pctToBps(pct));
  return Number((n + 9_999n) / 10_000n);
}

export function sum(values: Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Converts between currencies with a rate expressed as "1 unit of `from` = rate units of `to`".
 * Rates are strings with up to 8 decimals (as stored in Postgres numeric) to avoid float drift.
 * All enabled currencies use 2 minor digits (validated in config).
 */
export function convertMinor(amount: Minor, rate: string): Minor {
  const trimmed = rate.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) throw new RangeError(`Invalid FX rate ${rate}`);
  const [whole, frac = ""] = trimmed.split(".");
  const scaled = BigInt(whole + frac.padEnd(8, "0"));
  return Number(divRound(BigInt(assertMinor(amount)) * scaled, 100_000_000n));
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: Minor, currency: string, opts: { withCode?: boolean; locale?: string } = {}): string {
  const key = `${opts.locale ?? "en-US"}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(opts.locale ?? "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    formatters.set(key, f);
  }
  const text = f.format(amount / 100);
  return opts.withCode === false ? text : `${currency} ${text}`;
}

/** Parses user-entered amounts ("48,200.00", "€48.200,00" with locale de) into minor units. */
export function parseMoney(input: string, decimalSeparator: "." | "," = "."): Minor | null {
  const cleaned = input.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;
  const group = decimalSeparator === "." ? "," : ".";
  const normalised = cleaned.split(group).join("").replace(decimalSeparator, ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalised)) return null;
  const [w, f = ""] = normalised.replace("-", "").split(".");
  const value = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return normalised.startsWith("-") ? -value : value;
}

const shortFormatters = new Map<string, Intl.NumberFormat>();
function shortFormatter(currency: string, compact: boolean, digits: number) {
  const key = `${currency}|${compact}|${digits}`;
  let f = shortFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "symbol", // $, €, £; CA$ and A$ stay unambiguous
      notation: compact ? "compact" : "standard",
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
    shortFormatters.set(key, f);
  }
  return f;
}

/**
 * Money for summaries (docs/09 § Money): a symbol, no cents, compact from 10,000 up.
 * $7,106 · $98.6k · $100k · $1.2M · €98.6k. Detail screens keep formatMoney's full precision.
 */
export function formatMoneyShort(amount: Minor, currency: string): string {
  const units = Math.abs(amount) / 100;
  const text =
    units < 10_000
      ? shortFormatter(currency, false, 0).format(Math.round(units))
      : shortFormatter(currency, true, units < 100_000 || units >= 1_000_000 ? 1 : 0)
          .format(units)
          .replace(/K$/, "k");
  return amount < 0 ? `−${text}` : text;
}
