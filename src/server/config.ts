import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { ConfigurationError } from "./errors";

const optionalSecret = (name: string) =>
  Config.redacted(name).pipe(Config.withDefault(Redacted.make("")));
export const ownerEmailSchema = Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
const configuration = Effect.gen(function* () {
  const values = yield* Config.all({
    databaseUrl: Config.redacted("DATABASE_URL"),
    blobToken: optionalSecret("BLOB_READ_WRITE_TOKEN"),
    authSecret: optionalSecret("BETTER_AUTH_SECRET"),
    ownerEmail: Config.string("OWNER_EMAIL").pipe(Config.withDefault("")),
    baseUrl: Config.string("BETTER_AUTH_URL").pipe(Config.withDefault("http://localhost:3000")),
    portlessUrl: Config.string("PORTLESS_URL").pipe(Config.withDefault("")),
    nodeEnv: Config.string("NODE_ENV").pipe(Config.withDefault("development")),
    vercel: Config.string("VERCEL").pipe(Config.withDefault("")),
  });
  const databaseUrl = yield* Effect.try({
    try: () => new URL(Redacted.value(values.databaseUrl)),
    catch: () => new ConfigurationError({ message: "DATABASE_URL must be a Postgres URL." }),
  });
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !databaseUrl.hostname)
    return yield* new ConfigurationError({ message: "DATABASE_URL must be a Postgres URL." });
  // Hosted connections always validate both the certificate and hostname.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
    databaseUrl.searchParams.set("sslmode", "verify-full");
    databaseUrl.searchParams.delete("uselibpqcompat");
  }
  const production = values.nodeEnv === "production" || !!values.vercel;
  if (
    production &&
    (!Redacted.value(values.blobToken) ||
      !Redacted.value(values.authSecret) ||
      !values.ownerEmail.trim())
  )
    return yield* new ConfigurationError({
      message:
        "Configure DATABASE_URL, BLOB_READ_WRITE_TOKEN, BETTER_AUTH_SECRET, and OWNER_EMAIL before starting production.",
    });
  const baseUrl = !production && values.portlessUrl ? values.portlessUrl : values.baseUrl;
  const url = yield* Effect.try({
    try: () => new URL(baseUrl),
    catch: () => new ConfigurationError({ message: "BETTER_AUTH_URL must be an absolute URL." }),
  });
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (production && url.protocol !== "https:")
  )
    return yield* new ConfigurationError({
      message: "Use the canonical HTTPS site URL in production.",
    });
  const ownerEmail = values.ownerEmail.trim().toLowerCase();
  if (ownerEmail) yield* Schema.decodeEffect(ownerEmailSchema)(ownerEmail);
  if (Redacted.value(values.authSecret) && Redacted.value(values.authSecret).length < 32)
    return yield* new ConfigurationError({
      message: "BETTER_AUTH_SECRET must have at least 32 characters.",
    });
  return {
    ...values,
    baseUrl,
    databaseUrl: Redacted.make(databaseUrl.href),
    production,
    origin: url.origin,
    ownerEmail,
  };
}).pipe(
  Effect.mapError(
    () => new ConfigurationError({ message: "Check the server environment configuration." }),
  ),
);

export class AppConfig extends Context.Service<AppConfig, Effect.Success<typeof configuration>>()(
  "chronicon/server/AppConfig",
) {
  static readonly layer = Layer.effect(AppConfig, configuration);
}
