import { cn } from "./cn";
export const Table = ({ className, ...p }: React.ComponentProps<"table">) => <div className="relative w-full overflow-x-auto"><table className={cn("w-full border-collapse text-[13px]", className)} {...p} /></div>;
export const THead = (p: React.ComponentProps<"thead">) => <thead className="bg-gray-50" {...p} />;
export const TH = ({ className, ...p }: React.ComponentProps<"th">) => <th className={cn("h-9 whitespace-nowrap px-4 text-left text-[12px] font-medium text-gray-500 first:pl-5 last:pr-5", className)} {...p} />;
export const TR = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("border-t border-gray-100 transition-colors duration-150 ease-out", className)} {...p} />;
export const TD = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-4 py-2.5 align-middle first:pl-5 last:pr-5", className)} {...p} />;
