import type { Metadata } from "next";
import { Geist_Mono, Lexend_Deca } from "next/font/google";
import "./globals.css";

// Revision 5 (docs/09): Lexend Deca, the typeface HubSpot uses across its CRM, for everything a
// person reads; Geist Mono only for API keys and code samples.
const lexend = Lexend_Deca({ variable: "--font-lexend", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Signal Desk", template: "%s · Signal Desk" },
  description: "Expansion signals from product usage, triaged by customer success and routed to sellers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lexend.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
