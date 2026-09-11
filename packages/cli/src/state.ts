// oxlint-disable-next-line effecttsgo/node-builtin-import -- Portable Git subprocess boundary for Node, Bun, and Deno.
import { execFile } from "node:child_process";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- CLI credentials use the platform crypto implementation at this boundary.
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
      message:
        "Use --server https://HOST with no path, query, or credentials. HTTP is allowed only on localhost.",
    });

  return url.origin;
}

const readOptional = (file: string) =>
  attempt("Unable to read local configuration. Check file permissions.", () =>
    readFile(file, "utf8").catch((error: Error | Schema.Json) => {
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
    catch: () =>
      new CliError({
        message:
          "The repository's chronicon/project.json contains invalid JSON. Repair it before continuing.",
      }),
  });

  return yield* decode(associationSchema, parsed);
});

const sameAssociation = (a: Association, b: Association) =>
  a.server === b.server &&
  a.workspaceId === b.workspaceId &&
  a.projectId === b.projectId &&
  a.projectSlug === b.projectSlug;

const atomicJson = (file: string, value: Schema.Json, replace: boolean) =>
  Effect.gen(function* () {
    const directory = dirname(file);
    yield* attempt(
      "Unable to create the configuration directory. Check directory permissions.",
      () => mkdir(directory, { recursive: true, mode: 0o700 }),
    );
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    yield* Effect.acquireUseRelease(
      attempt("Unable to save local configuration. Check disk space and file permissions.", () =>
        writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" }),
      ),
      () =>
        Effect.tryPromise({
          try: () => (replace ? rename(temporary, file) : link(temporary, file)),
          catch: (error) =>
            new CliError({
              message: hasCode(error, "EEXIST")
                ? "Another process linked this repository first. Check the project link before using --relink."
                : "Unable to save local configuration. Check disk space and file permissions.",
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
        "This repository is linked to another project or account. Run chronicon project link ID --relink to replace its default.",
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

  const details = yield* attempt(
    "Unable to read saved login permissions. Check file permissions.",
    () => lstat(file),
  );

  if (details.isSymbolicLink() || (process.platform !== "win32" && (details.mode & 0o077) !== 0))
    return yield* new CliError({
      message: `Keep saved credentials in a regular file with owner-only access. Check ${file} and set permissions to 0600.`,
    });

  const parsed = yield* Effect.try({
    try: () => json(content),
    catch: () =>
      new CliError({ message: "Unable to read the saved login. Run chronicon login again." }),
  });

  const value = yield* decode(credentialSchema, parsed);

  if (value.server !== server)
    return yield* new CliError({
      message:
        "The saved login belongs to another server. Run chronicon login with the intended --server.",
    });

  return value;
});

export const saveCredential = (value: Credential) =>
  Effect.gen(function* () {
    const file = yield* credentialPath(value.server);
    yield* atomicJson(file, value, true);

    if (process.platform !== "win32")
      yield* attempt(
        "Unable to restrict access to the login directory. Check directory ownership and permissions.",
        () => chmod(dirname(file), 0o700),
      );
  });

export const removeCredential = (server: string) =>
  Effect.gen(function* () {
    const file = yield* credentialPath(server);
    yield* attempt(
      "CLI access has ended, but the saved login could not be removed. Check file permissions and run chronicon logout again.",
      () => rm(file, { force: true }),
    );
  });
