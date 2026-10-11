import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-brand font-medium text-white hover:bg-brand-strong",
  secondary: "bg-surface text-brand border border-brand hover:bg-brand-tint",
  ghost: "text-text hover:bg-hover",
  danger: "bg-risk text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-table",
  md: "h-10 px-5 text-body",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
