import { formatMoney, formatMoneyShort } from "@/core/money";
import { cx } from "./cx";

/** Money with its currency code shown when it differs from the context currency. */
export function Money({
  minor,
  currency,
  contextCurrency,
  className,
  signed,
}: {
  minor: number | null | undefined;
  currency: string;
  contextCurrency?: string;
  className?: string;
  signed?: boolean;
}) {
  if (minor === null || minor === undefined) return <span className="text-faint">–</span>;
  const withCode = !contextCurrency || contextCurrency !== currency;
  const text = formatMoney(Math.abs(minor), currency, { withCode });
  const sign = minor < 0 ? "−" : signed && minor > 0 ? "+" : "";
  return <span className={cx("num whitespace-nowrap", className)}>{sign}{text}</span>;
}

/**
 * Summary money (docs/09 § Money): "$98.6k" on screen, with the exact amount on hover and for
 * screen readers. Use on the overview, cards and lists; detail screens use <Money>.
 */
export function MoneyShort({ minor, currency, className }: { minor: number | null | undefined; currency: string; className?: string }) {
  if (minor === null || minor === undefined) return <span className="text-faint">–</span>;
  const exact = formatMoney(minor, currency);
  return (
    <span className={cx("num whitespace-nowrap", className)} title={exact}>
      <span aria-hidden>{formatMoneyShort(minor, currency)}</span>
      <span className="sr-only">{exact}</span>
    </span>
  );
}
