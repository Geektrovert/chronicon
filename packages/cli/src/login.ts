// oxlint-disable-next-line effecttsgo/node-builtin-import -- Opens the system browser through a native subprocess without a shell.
import { spawn } from "node:child_process";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- CLI authorization uses platform crypto primitives.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Native loopback callback listener, shared by Node, Bun, and Deno.
import { createServer } from "node:http";
import { Console, Deferred, Effect, Schema } from "effect";
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
    const host = address && !Schema.is(Schema.String)(address) ? `127.0.0.1:${address.port}` : "";

    if (
      request.method !== "GET" ||
      request.headers.host !== host ||
      !request.url?.startsWith("/callback?")
    ) {
      response.writeHead(400).end("This login link is invalid. Run chronicon login again.");

      return;
    }

    const url = new URL(request.url, `http://${host}`);
    const returned = url.searchParams.get("state") || "";

    if (
      !/^[A-Za-z0-9_-]{43}$/.test(returned) ||
      !timingSafeEqual(Buffer.from(returned), Buffer.from(state))
    ) {
      response.writeHead(400).end("This link belongs to another login. Run chronicon login again.");

      return;
    }

    const code = url.searchParams.get("code");
    const denied = url.searchParams.get("error") === "access_denied";

    if (!denied && (!code || !/^[A-Za-z0-9_-]{43}$/.test(code))) {
      response.writeHead(400).end("This login link is incomplete. Run chronicon login again.");

      return;
    }

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html lang="en"><meta name="color-scheme" content="light dark"><title>Chronicon CLI</title><h1>${denied ? "Authorization cancelled" : "Authorization received"}</h1><p>${denied ? "Return to your terminal. Run chronicon login when you want to connect." : "Return to your terminal to finish connecting."}</p></html>`,
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
        resume(
          Effect.fail(
            new CliError({
              message:
                "Unable to receive the browser login locally. Allow local network connections and run chronicon login again.",
            }),
          ),
        ),
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

  if (!address || Schema.is(Schema.String)(address))
    return yield* new CliError({
      message: "Unable to start the local login listener. Run chronicon login again.",
    });
  const redirectUri = `http://127.0.0.1:${address.port}/callback`;
  const url = new URL("/cli/authorize", server);
  url.search = new URLSearchParams({ redirectUri, state, challenge }).toString();
  yield* Console.error(`Open this link and choose Authorize CLI:\n${url.href}`);

  if (!noBrowser)
    yield* openBrowser(url.href).pipe(
      Effect.catchTag("CliError", (error) => Console.error(error.message)),
    );

  const code = yield* Effect.timeoutOrElse(Deferred.await(received), {
    duration: "5 minutes",
    orElse: () =>
      Effect.fail(new CliError({ message: "Login timed out. Run chronicon login again." })),
  });

  const issued = yield* http(server, "/api/cli/token", {
    method: "POST",
    body: { redirectUri, code, verifier },
  });

  const credential = yield* decode(credentialSchema, issued);

  if (credential.server !== server)
    return yield* new CliError({
      message:
        "The login response belongs to another server. Check --server and run chronicon login again.",
    });
  const previous = yield* readCredential(server).pipe(Effect.orElseSucceed(() => undefined));
  yield* saveCredential(credential);

  if (previous)
    yield* http(server, "/api/cli/token", { method: "DELETE", key: previous.key }).pipe(
      Effect.catchTag("CliError", () =>
        Console.error(
          "Connected. The previous CLI key may still be active. Revoke it from Connect an agent in the workspace sidebar.",
        ),
      ),
    );
  yield* Console.log(`Connected to ${server}. Access expires ${credential.expiresAt}.`);
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
