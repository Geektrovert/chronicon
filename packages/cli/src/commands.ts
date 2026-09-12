// oxlint-disable-next-line effecttsgo/node-builtin-import -- File-input boundary shared by Node, Bun, and Deno.
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { Config, Console, Effect, Schema } from "effect";
import { attempt, CliError, decode, json } from "./errors.ts";
import { login, logout } from "./login.ts";
import {
  associationSchema,
  readAssociation,
  readCredential,
  saveAssociation,
  serverOrigin,
  type Association,
  type Credential,
} from "./state.ts";
import { callTool, http } from "./transport.ts";

const help = `Chronicon CLI

Publish documents and manage project designs from your terminal.
Usage: chronicon COMMAND [options]

Account
  login [--no-browser]                  Authorize the CLI in your browser
  logout                                Revoke this terminal's key and remove its saved login
  whoami                                Show the signed-in account

Projects
  project list                          List projects and their revisions
  project create SLUG --name NAME       Create or reuse a project and link this repository
  project link ID [--relink]            Choose this repository's default project
  project update --name NAME --expected-revision N [--description TEXT]

Documents
  docs list [--query TEXT]              Browse or search documents
  docs read SLUG [--revision N]         Read HTML and revision history
  docs read --id ID [--revision N]      Read a document by ID
  docs upsert SLUG --file FILE --title TITLE --expected-revision N

Design systems
  design read [--json]                  Print design.md; use --json for settings and revision
  design update --file design.md --expected-revision N
  design update --input FILE            Save settings or guidance from JSON

Agent tools
  call TOOL --input FILE                Run any MCP tool with JSON input

Options: --server ORIGIN, --project ID, --summary TEXT, --kind plan|report|reference,
         --tags tag1,tag2, --relink, --json, --help

SLUG is a short name such as implementation-plan.
Use --expected-revision 0 for new documents. Read before updating. Each update
replaces all HTML and metadata. If the revision changed, read and merge before saving.
Data commands print JSON. design read prints Markdown unless you pass --json.
Use light/dark CSS variables, @media (prefers-color-scheme: dark), and
:root { color-scheme: light dark } so HTML previews follow the site's appearance.
`;

const readInputFile = Effect.fn("Cli.readInputFile")(function* (
  file: string,
  limit: number = 3_000_000,
) {
  const info = yield* attempt(
    "Unable to read the input file. Check its path and permissions.",
    () => stat(file),
  );

  if (!info.isFile() || info.size > limit)
    return yield* new CliError({
      message: `Use a regular file of ${limit.toLocaleString("en")} bytes or less.`,
    });

  return yield* attempt("Unable to read the input file. Check its path and permissions.", () =>
    readFile(file, "utf8"),
  );
});

function required(value: string | undefined, flag: string) {
  if (!value) throw new CliError({ message: `Provide ${flag}. Run chronicon --help for usage.` });

  return value;
}

function revision(value: string | undefined, flag: string, minimum: number) {
  const raw = required(value, flag);
  const number = Number(raw);

  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(number) || number < minimum)
    throw new CliError({ message: `${flag} must be an integer of at least ${minimum}.` });

  return number;
}

const projectSchema = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  organizationId: Schema.String,
  visibility: Schema.Literals(["private", "public"]),
  accessRole: Schema.optionalKey(Schema.Literals(["full_access", "edit", "view"])),
  slug: Schema.String,
  name: Schema.String,
  description: Schema.String,
  createdAt: Schema.String,
  revision: Schema.Int,
});

const objectSchema = Schema.Record(Schema.String, Schema.Json);

type CliJsonObject = Schema.Schema.Type<typeof Schema.JsonObject>;

const withAssociation = Schema.Struct({ association: Schema.NullOr(associationSchema) });

const readJsonInputFile = Effect.fn("Cli.readJsonInputFile")(function* (file: string) {
  const content = yield* readInputFile(file);

  const parsed = yield* Effect.try({
    try: () => json(content),
    catch: () => new CliError({ message: "The input file must contain a JSON object." }),
  });

  return yield* decode(objectSchema, parsed);
});

function reference(saved: Association | undefined, credential: Credential, explicit?: string) {
  if (explicit) return { id: explicit };

  if (!saved)
    throw new CliError({
      message: "Link a project with chronicon project link ID, or pass --project ID.",
    });

  if (saved.server !== credential.server || saved.workspaceId !== credential.workspaceId)
    throw new CliError({
      message:
        "This repository is linked to another server or account. Run chronicon project link ID --relink to replace its default.",
    });

  return { id: saved.projectId };
}

const print = (value: Schema.Json) => Console.log(JSON.stringify(value, null, 2));

const persistPublished = (result: Schema.Json, saved: Association | undefined, relink: boolean) =>
  Effect.gen(function* () {
    if (!Schema.is(withAssociation)(result) || (saved && !relink) || !result.association) return;
    yield* saveAssociation(result.association, relink).pipe(
      Effect.mapError(
        (error) =>
          new CliError({
            message: `Saved remotely, but the repository was not linked. ${error.message}`,
          }),
      ),
    );
  });

export const run = Effect.fn("Cli.run")(function* (args: string[]) {
  const { values, positionals } = yield* Effect.try({
    try: () =>
      parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        options: {
          help: { type: "boolean", short: "h" },
          json: { type: "boolean" },
          server: { type: "string" },
          project: { type: "string" },
          name: { type: "string" },
          query: { type: "string" },
          description: { type: "string" },
          file: { type: "string" },
          input: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          kind: { type: "string" },
          tags: { type: "string" },
          id: { type: "string" },
          revision: { type: "string" },
          "expected-revision": { type: "string" },
          relink: { type: "boolean" },
          "no-browser": { type: "boolean" },
        },
      }),
    catch: () => new CliError({ message: "Unknown or incomplete option. Run chronicon --help." }),
  });

  const [command, action, subject] = positionals;

  if (values.help || !command) return yield* Console.log(help);
  const saved = yield* readAssociation;
  const configuredServer = yield* Config.string("CHRONICON_SERVER").pipe(Config.withDefault(""));

  const server = yield* Effect.try({
    try: () =>
      serverOrigin(
        values.server || configuredServer || saved?.server || "https://chronicon.klyk.work",
      ),
    catch: () =>
      new CliError({
        message:
          "Use --server https://HOST with no path, query, or credentials. HTTP is allowed only on localhost.",
      }),
  });

  if (command === "login") return yield* login(server, !!values["no-browser"]);
  const credential = yield* readCredential(server);

  if (command === "logout") return yield* logout(credential);

  if (command === "whoami")
    return yield* print(yield* http(server, "/api/account", { key: credential.key }));

  const call = (tool: string, input: Schema.JsonObject) =>
    callTool(server, credential.key, tool, input);

  if (command === "project") {
    if (action === "list") return yield* print(yield* call("list_projects", {}));

    if (action === "link") {
      const selected = required(subject, "a project ID");
      const projects = yield* decode(Schema.Array(projectSchema), yield* call("list_projects", {}));
      const exact = projects.find((project) => project.id === selected);
      const matches = exact ? [exact] : projects.filter((project) => project.slug === selected);

      if (matches.length > 1)
        return yield* new CliError({
          message:
            "Several teams have this project slug. Use the project ID from chronicon project list.",
        });
      const project = matches[0];

      if (!project)
        return yield* new CliError({
          message:
            "This account cannot access that project. Run chronicon project list to choose one.",
        });

      const association: Association = {
        version: 1,
        server,
        workspaceId: credential.workspaceId,
        projectId: project.id,
        projectSlug: project.slug,
      };

      yield* saveAssociation(association, !!values.relink);

      return yield* print(association);
    }

    if (action === "create") {
      const slug = required(subject, "a project slug");

      if (
        saved &&
        !values.relink &&
        (saved.server !== server ||
          saved.workspaceId !== credential.workspaceId ||
          saved.projectSlug !== slug)
      )
        return yield* new CliError({
          message: "This repository already has a default project. Add --relink to replace it.",
        });

      const result = yield* http(server, "/api/projects", {
        method: "POST",
        key: credential.key,
        body: {
          slug,
          name: required(values.name, "--name"),
          description: values.description || "",
        },
      });

      yield* print(result);

      return yield* persistPublished(result, undefined, !!values.relink);
    }

    if (action === "update") {
      const project = reference(saved, credential, values.project);

      const body = {
        id: project.id,
        name: required(values.name, "--name"),
        expectedRevision: revision(values["expected-revision"], "--expected-revision", 1),
      };

      if (values.description !== undefined)
        Object.assign(body, { description: values.description });

      return yield* print(
        yield* http(server, "/api/projects", {
          method: "PATCH",
          key: credential.key,
          body,
        }),
      );
    }
  }

  if (command === "docs") {
    const project =
      action === "read" && values.id
        ? undefined
        : values.project || saved
          ? reference(saved, credential, values.project)
          : undefined;

    if (action === "list") {
      const input = Object.assign(
        {},
        project ? { project } : undefined,
        values.query ? { query: values.query } : undefined,
      );

      return yield* print(yield* call("find_documents", input));
    }

    if (action === "read") {
      const input: CliJsonObject = values.id
        ? { id: values.id }
        : {
            project: project || reference(saved, credential),
            slug: required(subject, "a document slug"),
          };

      if (values.revision)
        Object.assign(input, { revision: revision(values.revision, "--revision", 1) });

      return yield* print(yield* call("read_document", input));
    }

    if (action === "upsert") {
      const html = yield* readInputFile(required(values.file, "--file"), 2_000_000);

      const result = yield* call("upsert_document", {
        project: project || reference(saved, credential),
        slug: required(subject, "a document slug"),
        title: required(values.title, "--title"),
        summary: values.summary || "",
        kind: values.kind || "report",
        tags:
          values.tags
            ?.split(",")
            .map((tag) => tag.trim())
            .filter(Boolean) || [],
        html,
        expectedRevision: revision(values["expected-revision"], "--expected-revision", 0),
      });

      yield* print(result);

      return yield* persistPublished(result, saved, false);
    }
  }

  if (command === "design") {
    const project = reference(saved, credential, values.project);

    if (action === "read") {
      const result = yield* call("read_project_design", { project });

      if (values.json) return yield* print(result);
      const design = yield* decode(objectSchema, result);

      return yield* Console.log(yield* decode(Schema.String, design.markdown));
    }

    if (action === "update") {
      if (values.file && values.input)
        return yield* new CliError({
          message: "Use --file for Markdown or --input for JSON, not both.",
        });

      const input = values.input
        ? yield* readJsonInputFile(values.input)
        : { markdown: yield* readInputFile(required(values.file, "--file or --input"), 100_000) };

      const request = { ...input, project };

      if (values["expected-revision"] !== undefined)
        Object.assign(request, {
          expectedRevision: revision(values["expected-revision"], "--expected-revision", 0),
        });

      return yield* print(yield* call("update_project_design", request));
    }
  }

  if (command === "call") {
    const tool = required(action, "a tool name");
    const input = { ...(yield* readJsonInputFile(required(values.input, "--input"))) };

    if (
      [
        "read_document",
        "upsert_document",
        "find_documents",
        "read_project_design",
        "update_project_design",
      ].includes(tool) &&
      !input.project &&
      !input.id &&
      (saved || values.project)
    )
      input.project = reference(saved, credential, values.project);
    const result = yield* call(tool, input);
    yield* print(result);

    return yield* persistPublished(result, saved, !!values.relink);
  }

  return yield* new CliError({ message: "Unknown command. Run chronicon --help." });
});
