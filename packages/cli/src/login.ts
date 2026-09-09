// oxlint-disable-next-line effecttsgo/node-builtin-import -- Opens the system browser through a native subprocess without a shell.
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Native loopback callback listener, shared by Node, Bun, and Deno.
import { createServer } from "node:http";
import { Console, Deferred, Effect } from "effect";
import { CliError, decode } from "./errors.ts";
import {
  credentialSchema,
  readCredential,
  removeCredential,
  saveCredential,
  type Credential,
} from "./state.ts";
import { http } from "./transport.ts";

const random = () => randomBytes(32).toString("base64url");
const openBrowser = (url: string) =>
  Effect.callback<void, CliError>((resume) => {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "rundll32.exe"
          : "xdg-open";
    const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
    const child = spawn(command, args, { stdio: "ignore", detached: true, shell: false });
    child.once("error", () =>
      resume(
        Effect.fail(new CliError({ message: "Open the login URL printed above in your browser." })),
      ),
    );
    child.once("spawn", () => {
      child.unref();
      resume(Effect.void);
    });
  });

export const login = Effect.fn("Cli.login")(function* (server: string, noBrowser: boolean) {
  const state = random();
  const verifier = random();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const received = yield* Deferred.make<string, CliError>();
  const complete = Effect.runSyncWith(yield* Effect.context<never>());
  const listener = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    const address = listener.address();
    const host = address && typeof address !== "string" ? `127.0.0.1:${address.port}` : "";
    if (
      request.method !== "GET" ||
      request.headers.host !== host ||
      !request.url?.startsWith("/callback?")
    ) {
      response.writeHead(400).end("Invalid callback.");
      return;
    }
    const url = new URL(request.url, `http://${host}`);
    const returned = url.searchParams.get("state") || "";
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(returned) ||
      !timingSafeEqual(Buffer.from(returned), Buffer.from(state))
    ) {
      response.writeHead(400).end("Invalid login state.");
      return;
    }
    const code = url.searchParams.get("code");
    const denied = url.searchParams.get("error") === "access_denied";
    if (!denied && (!code || !/^[A-Za-z0-9_-]{43}$/.test(code))) {
      response.writeHead(400).end("Invalid authorization code.");
      return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><meta name="color-scheme" content="light dark"><title>Chronicon CLI</title><p>${denied ? "Authorization cancelled." : "Authorization received. Return to your terminal to finish connecting."}</p>`,
    );
    if (denied)
      complete(Deferred.fail(received, new CliError({ message: "Authorization cancelled." })));
    else if (code) complete(Deferred.succeed(received, code));
  });
  listener.requestTimeout = 10_000;
  listener.headersTimeout = 10_000;
  yield* Effect.acquireRelease(
    Effect.callback<void, CliError>((resume) => {
      listener.once("error", () =>
        resume(Effect.fail(new CliError({ message: "Unable to open a loopback callback port." }))),
      );
      listener.listen(0, "127.0.0.1", () => resume(Effect.void));
      return Effect.sync(() => {
        listener.closeAllConnections();
        listener.close();
      });
    }),
    () =>
      Effect.sync(() => {
        listener.closeAllConnections();
        listener.close();
      }),
  );
  const address = listener.address();
  if (!address || typeof address === "string")
    return yield* new CliError({ message: "No loopback callback port was assigned." });
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const url = new URL("/cli/authorize", server);
  url.search = new URLSearchParams({ redirectUri, state, challenge }).toString();
  yield* Console.error(`Open this URL to authorize Chronicon:\n${url.href}`);
  if (!noBrowser)
    yield* openBrowser(url.href).pipe(
      Effect.catchTag("CliError", (error) => Console.error(error.message)),
    );
  const code = yield* Deferred.await(received).pipe(
    Effect.timeout("5 minutes"),
    Effect.catchTag(
      "TimeoutError",
      () => new CliError({ message: "Login timed out. Run login again." }),
    ),
  );
  const issued = yield* http(server, "/api/cli/token", {
    method: "POST",
    body: { redirectUri, code, verifier },
  });
  const credential = yield* decode(credentialSchema, issued);
  if (credential.server !== server)
    return yield* new CliError({
      message: "The server returned credentials for a different origin.",
    });
  const previous = yield* readCredential(server).pipe(Effect.orElseSucceed(() => undefined));
  yield* saveCredential(credential);
  if (previous)
    yield* http(server, "/api/cli/token", { method: "DELETE", key: previous.key }).pipe(
      Effect.catchTag("CliError", () =>
        Console.error(
          "Connected. The previous CLI key may still be active; revoke it in Settings.",
        ),
      ),
    );
  yield* Console.log(`Connected to ${server}. Credentials expire ${credential.expiresAt}.`);
}, Effect.scoped);

export const logout = Effect.fn("Cli.logout")(function* (credential: Credential) {
  yield* http(credential.server, "/api/cli/token", { method: "DELETE", key: credential.key }).pipe(
    Effect.catchTag("CliError", (error) =>
      error.status === 401 ? Effect.void : Effect.fail(error),
    ),
  );
  yield* removeCredential(credential.server);
  yield* Console.log("Signed out. The CLI key is revoked or expired.");
});
