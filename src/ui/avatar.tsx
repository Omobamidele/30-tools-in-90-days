import { cx } from "./cx";

// Initials on a colour derived from the name, so a person keeps the same colour everywhere.
// All backgrounds carry white text at ≥4.5:1. No red or amber: those mean risk in this product.
const palette = ["#3e4784", "#6941c6", "#0e7090", "#107569", "#9e165f", "#475467", "#5925dc", "#1849a9", "#026aa2"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      title={name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: palette[hash(name) % palette.length] }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white", className)}
    >
      {initials(name)}
    </span>
  );
}

/** Avatar followed by the name, for owner columns. */
export function Person({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <Avatar name={name} size={22} />
      {name}
    </span>
  );
}

/** Small square colour key for a client, derived from the name. */
export function ClientDot({ name }: { name: string }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: palette[hash(name) % palette.length] }} />;
}
