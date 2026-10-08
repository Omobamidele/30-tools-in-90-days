import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// "Modern CRM workspace" (docs/09, revision 2): Geist for everything a person reads; Geist Mono
// only for API keys and code samples.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Signal Desk", template: "%s · Signal Desk" },
  description: "Expansion signals from product usage, triaged by customer success and routed to sellers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
