import { cn } from "./cn";
export const Table = ({ className, ...p }: React.ComponentProps<"table">) => <div className="relative w-full overflow-x-auto"><table className={cn("w-full border-collapse text-[14px]", className)} {...p} /></div>;
export const THead = (p: React.ComponentProps<"thead">) => <thead className="border-b border-line" {...p} />;
export const TH = ({ className, ...p }: React.ComponentProps<"th">) => <th className={cn("h-10 whitespace-nowrap px-3 text-left text-[13px] font-medium text-muted first:pl-5 last:pr-5", className)} {...p} />;
export const TR = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-t border-line first:border-t-0", className)} {...p} />;
export const TD = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("h-14 px-3 align-middle first:pl-5 last:pr-5", className)} {...p} />;
