// oxlint-disable-next-line effecttsgo/node-builtin-import -- Portable Git subprocess boundary for Node, Bun, and Deno.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Native hard-link creation provides the repository's no-replace write contract.
import { chmod, link, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- Pure paths at the portable CLI filesystem boundary.
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { Config, Effect, Schema } from "effect";
import { attempt, CliError, decode, hasCode, json } from "./errors.ts";

const execute = promisify(execFile);
export const associationSchema = Schema.Struct({
  version: Schema.Literal(1),
  server: Schema.String,
  workspaceId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  projectSlug: Schema.NonEmptyString,
});
export type Association = typeof associationSchema.Type;
export const credentialSchema = Schema.Struct({
  server: Schema.String,
  workspaceId: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  keyId: Schema.NonEmptyString,
  expiresAt: Schema.String,
});
export type Credential = typeof credentialSchema.Type;

export function serverOrigin(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw new CliError({
      message: "Use an HTTPS server origin, or HTTP localhost for development.",
    });
  return url.origin;
}

const readOptional = (file: string) =>
  attempt("Unable to read local configuration.", () =>
    readFile(file, "utf8").catch((error: unknown) => {
      if (hasCode(error, "ENOENT")) return undefined;
      throw error;
    }),
  );

const associationPath = attempt(
  "Run this command inside a Git repository to save its project.",
  () =>
    execute("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: process.cwd(),
    }).then(({ stdout }) => join(stdout.trim(), "chronicon", "project.json")),
);

export const readAssociation = Effect.gen(function* () {
  const file = yield* associationPath.pipe(Effect.orElseSucceed(() => undefined));
  if (!file) return undefined;
  const content = yield* readOptional(file);
  if (content === undefined) return undefined;
  const parsed = yield* Effect.try({
    try: () => json(content),
    catch: () => new CliError({ message: "The repository's chronicon/project.json is invalid." }),
  });
  return yield* decode(associationSchema, parsed);
});

const sameAssociation = (a: Association, b: Association) =>
  a.version === b.version &&
  a.server === b.server &&
  a.workspaceId === b.workspaceId &&
  a.projectId === b.projectId &&
  a.projectSlug === b.projectSlug;

const atomicJson = (file: string, value: unknown, replace: boolean) =>
  Effect.gen(function* () {
    const directory = dirname(file);
    yield* attempt("Unable to prepare local configuration.", () =>
      mkdir(directory, { recursive: true, mode: 0o700 }),
    );
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    yield* Effect.acquireUseRelease(
      attempt("Unable to save local configuration.", () =>
        writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }),
      ),
      () =>
        Effect.tryPromise({
          try: () => (replace ? rename(temporary, file) : link(temporary, file)),
          catch: (error) =>
            new CliError({
              message: hasCode(error, "EEXIST")
                ? "Another process linked this repository first."
                : "Unable to install local configuration.",
              status: hasCode(error, "EEXIST") ? 409 : undefined,
            }),
        }),
      () =>
        attempt("Unable to remove temporary configuration.", () =>
          rm(temporary, { force: true }),
        ).pipe(Effect.ignore),
    );
  });

export const saveAssociation = Effect.fn("Cli.saveAssociation")(function* (
  value: Association,
  relink: boolean = false,
) {
  const file = yield* associationPath;
  const current = yield* readAssociation;
  if (current && sameAssociation(current, value)) return;
  if (current && !relink)
    return yield* new CliError({
      message:
        "This repository is linked to another project or account. Use project link ID --relink explicitly.",
    });
  yield* atomicJson(file, value, relink).pipe(
    Effect.catchTag("CliError", (error) =>
      Effect.gen(function* () {
        if (error.status !== 409) return yield* error;
        const winner = yield* readAssociation;
        if (!winner || !sameAssociation(winner, value)) return yield* error;
      }),
    ),
  );
});

const credentialPath = (server: string) =>
  Effect.gen(function* () {
    const configured = yield* Config.string("XDG_CONFIG_HOME").pipe(Config.withDefault(""));
    const base = isAbsolute(configured) ? configured : join(homedir(), ".config");
    return join(base, "chronicon", createHash("sha256").update(server).digest("hex") + ".json");
  });

export const readCredential = Effect.fn("Cli.readCredential")(function* (server: string) {
  const file = yield* credentialPath(server);
  const content = yield* readOptional(file);
  if (!content) return yield* new CliError({ message: "Run chronicon login first." });
  const details = yield* attempt("Unable to inspect credential permissions.", () => lstat(file));
  if (details.isSymbolicLink() || (process.platform !== "win32" && (details.mode & 0o077) !== 0))
    return yield* new CliError({
      message: "Credentials must be a private regular file with mode 0600.",
    });
  const parsed = yield* Effect.try({
    try: () => json(content),
    catch: () => new CliError({ message: "Saved credentials are unreadable. Run login again." }),
  });
  const value = yield* decode(credentialSchema, parsed);
  if (value.server !== server)
    return yield* new CliError({ message: "Saved credentials belong to a different server." });
  return value;
});

export const saveCredential = (value: Credential) =>
  Effect.gen(function* () {
    const file = yield* credentialPath(value.server);
    yield* atomicJson(file, value, true);
    if (process.platform !== "win32")
      yield* attempt("Unable to protect credential directory.", () => chmod(dirname(file), 0o700));
  });
export const removeCredential = (server: string) =>
  Effect.gen(function* () {
    const file = yield* credentialPath(server);
    yield* attempt("Unable to remove local credentials.", () => rm(file, { force: true }));
  });
