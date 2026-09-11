export const posthogProxyPrefix = "/api/cairn-v7q";

export const posthogSdkPaths = [
  ["/i/v0/e/", "/p1/"],
  ["/e/", "/p2/"],
  ["/s/", "/p3/"],
  ["/flags/", "/p4/"],
  ["/array/", "/p5/"],
  ["/static/", "/p6/"],
  ["/i/v1/logs", "/p7"],
] as const;

// Browser traces use a direct OTLP export.
export const posthogTracePath = ["/i/v1/traces", "/p8"] as const;

export function posthogHosts(configuredHost: string) {
  const region = /^(https:\/\/)?eu(\.i)?\.posthog\.com\/?$/.test(configuredHost) ? "eu" : "us";

  return {
    ingestion: `https://${region}.i.posthog.com`,
    assets: `https://${region}-assets.i.posthog.com`,
    ui: `https://${region}.posthog.com`,
  };
}
