import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalGuard AI - Intelligent Traffic Emergency Response",
  description: "AI-powered traffic emergency detection and signal priority platform. VERIFY. PRIORITIZE. RESPOND.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-white antialiased">{children}</body>
    </html>
  );
}
