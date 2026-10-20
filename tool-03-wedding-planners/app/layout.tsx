import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", weight: ["400", "500", "600", "700"] });
export const metadata: Metadata = { title: { default: "Wedding Enquiries", template: "%s | Wedding Enquiries" }, description: "Tool 03: every wedding enquiry in one list, fast first replies, quote nudges and referral asks." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={figtree.variable}>
      <body className="bg-canvas font-sans text-[14px] leading-5 text-fg">
        {children}
        <Toaster position="bottom-right" visibleToasts={3} duration={4000}
          toastOptions={{ unstyled: true, classNames: { toast: "flex w-[356px] items-center gap-2.5 rounded-panel bg-ink px-4 py-3 text-[14px] text-white shadow-overlay", description: "text-[13px] text-rail-fg", icon: "text-white" } }} />
      </body>
    </html>
  );
}
