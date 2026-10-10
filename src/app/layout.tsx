import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: { default: "FIZZ — AI by RANEDDIE", template: "%s · FIZZ" },
  description: "FIZZ is RANEDDIE's AI assistant. FIZZ DEV is the AI workspace for building software, websites, and games.",
  applicationName: "FIZZ",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
