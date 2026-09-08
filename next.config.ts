import type { NextConfig } from "next";
import { Config, Effect } from "effect";

const portlessUrl = Effect.runSync(Config.string("PORTLESS_URL").pipe(Config.withDefault("")));

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  allowedDevOrigins: portlessUrl ? [new URL(portlessUrl).hostname] : [],
  // Keep the cursor's CommonJS driver imports in the native runtime too.
  serverExternalPackages: ["pg", "pg-cursor"],
  // oxlint-disable-next-line effecttsgo/async-function -- Next requires a Promise-returning headers configuration.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
