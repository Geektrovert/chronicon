import { Config, Effect, Exit, Schema, Stream } from "effect";
import { posthogHosts, posthogProxyPrefix, posthogSdkPaths, posthogTracePath } from "@/lib/posthog";

const paths = [...posthogSdkPaths, posthogTracePath];
const maximumBodyBytes = 4_000_000;
const maximumResponseBytes = 8_000_000;
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

class ProxyError extends Schema.TaggedError<ProxyError>()("ProxyError", {
  status: Schema.Finite,
}) {}

const readBody = Effect.fn("TelemetryProxy.readBody")(function* (
  incoming: ReadableStream<Uint8Array>,
  limit: number,
  invalidStatus: number,
  oversizedStatus: number,
) {
  const chunks = yield* Stream.fromReadableStream({
    evaluate: () => incoming,
    onError: () => new ProxyError({ status: invalidStatus }),
  }).pipe(
    Stream.runFoldEffect(
      () => ({ bytes: 0, chunks: [] as Uint8Array[] }),
      (acc, chunk) => {
        const bytes = acc.bytes + chunk.byteLength;
        if (bytes > limit) return Effect.fail(new ProxyError({ status: oversizedStatus }));
        acc.chunks.push(chunk);
        return Effect.succeed({ bytes, chunks: acc.chunks });
      },
    ),
  );
  const body = new Uint8Array(chunks.bytes);
  let offset = 0;
  for (const chunk of chunks.chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
});

const forward = Effect.fn("TelemetryProxy.forward")(function* (request: Request) {
  const url = new URL(request.url);
  const config = yield* Config.all({
    host: Config.string("NEXT_PUBLIC_POSTHOG_HOST").pipe(
      Config.withDefault("https://us.posthog.com"),
    ),
    token: Config.string("NEXT_PUBLIC_POSTHOG_KEY").pipe(Config.withDefault("")),
    siteUrl: Config.string("BETTER_AUTH_URL").pipe(Config.withDefault("")),
    portlessUrl: Config.string("PORTLESS_URL").pipe(Config.withDefault("")),
    deploymentHost: Config.string("VERCEL_URL").pipe(Config.withDefault("")),
    branchHost: Config.string("VERCEL_BRANCH_URL").pipe(Config.withDefault("")),
    productionHost: Config.string("VERCEL_PROJECT_PRODUCTION_URL").pipe(Config.withDefault("")),
    nodeEnv: Config.string("NODE_ENV").pipe(Config.withDefault("development")),
  });
  // TLS can terminate before Next, making request.url an internal HTTP origin.
  // Only configured public origins join that origin; forwarded host headers are untrusted.
  const allowedOrigins = new Set([url.origin]);
  for (const value of [
    config.siteUrl,
    config.nodeEnv === "development" ? config.portlessUrl : "",
    ...[config.deploymentHost, config.branchHost, config.productionHost].map((host) =>
      host ? `https://${host}` : "",
    ),
  ]) {
    if (!value) continue;
    const configured = yield* Effect.try(() => new URL(value)).pipe(
      Effect.orElseSucceed(() => undefined),
    );
    if (
      configured &&
      !configured.username &&
      !configured.password &&
      (configured.protocol === "https:" ||
        (config.nodeEnv === "development" &&
          configured.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname)))
    )
      allowedOrigins.add(configured.origin);
  }
  const origin = request.headers.get("origin");
  if (
    (origin && !allowedOrigins.has(origin)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return new Response(null, { status: 403, headers: responseHeaders });

  let path = url.pathname.slice(posthogProxyPrefix.length);
  for (const [upstream, alias] of paths) {
    if (path === alias.replace(/\/$/, "") || path.startsWith(alias)) {
      path = upstream + path.slice(alias.length);
      break;
    }
  }
  const asset = /^\/(static|array)\/[a-zA-Z0-9_./-]+$/.test(path);
  const ingestion = /^\/(e|s|flags|decide|capture|batch|i\/v0\/e|i\/v1\/(logs|traces))\/?$/.test(
    path,
  );
  if ((!asset && !ingestion) || path.includes("..") || url.search.length > 16_384)
    return new Response(null, { status: 404, headers: responseHeaders });
  if (asset && request.method === "POST")
    return new Response(null, { status: 405, headers: responseHeaders });

  if (!config.token.startsWith("phc_"))
    return new Response(null, { status: 503, headers: responseHeaders });
  const hosts = posthogHosts(config.host);
  const destination = new URL(path + url.search, asset ? hosts.assets : hosts.ingestion);

  // Construct fresh headers. App cookies, bearer keys, referers and forwarding headers stay here.
  const headers = new Headers();
  for (const name of ["accept", "content-type", "content-encoding"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (/^\/i\/v1\/(logs|traces)\/?$/.test(path))
    headers.set("authorization", `Bearer ${config.token}`);

  const body =
    request.method === "POST" && request.body
      ? yield* readBody(request.body, maximumBodyBytes, 400, 413)
      : undefined;
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      // oxlint-disable-next-line effecttsgo/global-fetch-in-effect -- Preserve the SDK's compressed wire body; Effect owns cancellation and bounded body reads.
      fetch(destination, {
        method: request.method,
        headers,
        body,
        signal,
        redirect: "manual",
        cache: "no-store",
      }),
    catch: () => new ProxyError({ status: 502 }),
  });
  // Consume within this Effect so a timeout or disconnected client cancels the reader.
  const responseBody = response.body
    ? yield* readBody(response.body, maximumResponseBytes, 502, 502)
    : null;
  if (response.status >= 300 && response.status < 400)
    return new Response(null, { status: 502, headers: responseHeaders });
  const outgoing = new Headers(responseHeaders);
  const contentType = response.headers.get("content-type");
  if (contentType) outgoing.set("content-type", contentType);
  // fetch decompresses upstream bodies. Never copy content-encoding/length or set-cookie.
  return new Response(request.method === "HEAD" ? null : responseBody, {
    status: response.status,
    headers: outgoing,
  });
});

function proxy(request: Request) {
  return Effect.runPromiseExit(
    forward(request).pipe(
      Effect.timeout("15 seconds"),
      Effect.catchTag("ProxyError", (error) =>
        Effect.succeed(new Response(null, { status: error.status, headers: responseHeaders })),
      ),
    ),
    { signal: request.signal },
  ).then((exit) =>
    Exit.isSuccess(exit)
      ? exit.value
      : new Response(null, { status: 502, headers: responseHeaders }),
  );
}

export { proxy as GET, proxy as POST, proxy as HEAD };
