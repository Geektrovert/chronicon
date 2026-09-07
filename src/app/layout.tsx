import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const departureMono = localFont({
  src: "./fonts/departure-mono.woff2",
  variable: "--font-departure-mono",
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Chronicon", template: "%s · Chronicon" },
  description: "A private library for plans, reports, and ideas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${departureMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
