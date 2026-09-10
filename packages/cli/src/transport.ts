import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Effect, Schema } from "effect";
import { attempt, CliError, json } from "./errors.ts";

const remoteError = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
});

export const http = Effect.fn("Cli.http")(function* (
  server: string,
  path: string,
  options: { method?: string; key?: string; body?: unknown } = {},
) {
  const response = yield* attempt(
    "Connection failed. Check whether your changes were saved before retrying.",
    (signal) =>
      // oxlint-disable-next-line effecttsgo/global-fetch -- Portable HTTP boundary with redirects and automatic write retries disabled.
      fetch(new URL(path, server), {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(options.key ? { Authorization: `Bearer ${options.key}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        redirect: "error",
        cache: "no-store",
        credentials: "omit",
      }),
  );
  const data: unknown = yield* attempt(
    "Unable to read the server response. Check whether your changes were saved before retrying.",
    () => response.json(),
  );
  if (!response.ok) {
    const error = Schema.is(remoteError)(data) ? data.error || data.message : undefined;
    return yield* new CliError({
      message: error || `Request failed (${response.status}).`,
      status: response.status,
    });
  }
  return data;
});

export const callTool = Effect.fn("Cli.callTool")(function* (
  server: string,
  key: string,
  name: string,
  input: Record<string, unknown>,
) {
  const client = yield* Effect.acquireRelease(
    Effect.sync(() => new Client({ name: "chronicon-cli", version: "0.1.0" })),
    (client) =>
      attempt("Unable to close the MCP connection.", () => client.close()).pipe(Effect.ignore),
  );
  const transport = new StreamableHTTPClientTransport(new URL("/api/mcp", server), {
    requestInit: {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      credentials: "omit",
    },
  });
  yield* attempt("Unable to connect to Chronicon. Check your server and login.", () =>
    client.connect(transport),
  );
  const result = yield* attempt(
    "Unable to confirm the operation. Read the current saved revision before retrying an update.",
    (signal) => client.callTool({ name, arguments: input }, { signal }),
  );
  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  if (result.isError)
    return yield* new CliError({ message: text || "Chronicon could not complete the operation." });
  return yield* Effect.try({
    try: () => json(text),
    catch: () =>
      new CliError({
        message:
          "Unable to read the MCP response. Check whether your changes were saved before retrying.",
      }),
  });
}, Effect.scoped);
