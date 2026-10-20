import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata: Metadata = { title: { default: "Wedding Enquiries", template: "%s · Wedding Enquiries" }, description: "Tool 03 · every wedding enquiry in one list, fast first replies, quote nudges and referral asks." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={inter.variable}>
      <body className="font-sans text-[13px] leading-5">
        {children}
        <Toaster position="bottom-right" visibleToasts={3} duration={4000} toastOptions={{ classNames: { toast: "!rounded-lg !border !border-gray-200 !shadow-lg !text-[13px] !font-sans" } }} />
      </body>
    </html>
  );
}
