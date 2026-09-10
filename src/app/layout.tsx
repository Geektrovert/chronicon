import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import { ThemeProvider } from "@/components/ui/theme";
import { TelemetryNavigation } from "@/components/telemetry";
import "./globals.css";

// oxlint-disable-next-line effecttsgo/process-env -- Next.js replaces NODE_ENV at build time.
const isDevelopment = process.env.NODE_ENV === "development";

const departureMono = localFont({
  src: "./fonts/departure-mono.woff2",
  variable: "--font-departure-mono",
  weight: "400",
  display: "swap",
});

const nacelle = localFont({
  src: [
    { path: "./fonts/nacelle-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/nacelle-semibold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-nacelle",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Chronicon", template: "%s · Chronicon" },
  description: "A private library for plans, reports, and ideas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${departureMono.variable} ${nacelle.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {isDevelopment && (
          <Script
            src="https://unpkg.com/react-grab@0.2.0/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <Suspense fallback={null}>
            <TelemetryNavigation />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
