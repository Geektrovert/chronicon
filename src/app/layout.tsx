import type { Metadata } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/ui/theme";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
