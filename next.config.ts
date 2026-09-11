import type { NextConfig } from "next";
import { Config, Effect, Redacted } from "effect";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { posthogHosts } from "./src/lib/posthog";
import { robotsDirective } from "./src/lib/crawlers";

const portlessUrl = Effect.runSync(Config.string("PORTLESS_URL").pipe(Config.withDefault("")));

const buildMetadata = Effect.runSync(
  Config.all({
    release: Config.string("NEXT_PUBLIC_APP_RELEASE").pipe(
      Config.orElse(() => Config.string("VERCEL_GIT_COMMIT_SHA")),
      Config.withDefault("development"),
    ),
    environment: Config.string("NEXT_PUBLIC_APP_ENV").pipe(
      Config.orElse(() => Config.string("VERCEL_ENV")),
      Config.orElse(() => Config.string("NODE_ENV")),
      Config.withDefault("development"),
    ),
  }),
);

const nextConfig: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  skipTrailingSlashRedirect: true,
  productionBrowserSourceMaps: false,
  env: {
    NEXT_PUBLIC_APP_RELEASE: buildMetadata.release,
    NEXT_PUBLIC_APP_ENV: buildMetadata.environment,
  },
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
          { key: "X-Robots-Tag", value: robotsDirective },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

const sourceMaps = Effect.runSync(
  Config.all({
    personalApiKey: Config.redacted("POSTHOG_API_KEY").pipe(Config.withDefault(Redacted.make(""))),
    projectId: Config.string("POSTHOG_PROJECT_ID").pipe(Config.withDefault("555830")),
    host: Config.string("NEXT_PUBLIC_POSTHOG_HOST").pipe(
      Config.withDefault("https://us.posthog.com"),
    ),
  }),
);

export default Redacted.value(sourceMaps.personalApiKey)
  ? withPostHogConfig(nextConfig, {
      personalApiKey: Redacted.value(sourceMaps.personalApiKey),
      projectId: sourceMaps.projectId,
      host: posthogHosts(sourceMaps.host).ui,
      sourcemaps: {
        enabled: true,
        releaseName: "chronicon",
        releaseVersion: buildMetadata.release,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
