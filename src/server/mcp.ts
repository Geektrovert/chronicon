import {
  createMcpHandler,
  McpServer,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { Effect, Exit, Schema } from "effect";
import {
  projectReference,
  publishInput,
  revisionNumber,
  slugSchema,
  type Principal,
} from "@/lib/model";
import { findDocuments } from "./actions/discovery";
import { authenticate } from "./actions/access";
import { AppConfig } from "./config";
import { readDocumentByReference, publishDocument } from "./actions/documents";
import { LibraryInvalidation, readCachedLibrary, requestLibraryInvalidation } from "./cache";
import { agentInstructions } from "./agent-instructions";
import { AppError } from "./errors";
import { readDesignInput, updateDesignInput } from "@/lib/project-design/model";
import { readProjectDesign, updateProjectDesign } from "./actions/project-design";
import { failure, privateHeaders, readBody } from "./http";
import { runtime, type AppServices } from "./runtime";

function standard<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
): StandardSchemaWithJSON<S["Encoded"], S["Type"]> {
  return {
    "~standard": {
      ...Schema.toStandardJSONSchemaV1(schema)["~standard"],
      // Match REST validation: do not discard an ID and retry the creation branch.
      ...Schema.toStandardSchemaV1(schema, {
        parseOptions: { onExcessProperty: "error" },
      })["~standard"],
    },
  };
}
// Only the protocol callbacks convert Effect to Promise.
function handler(
  principal: Principal,
  origin: string,
  cache: ReturnType<typeof requestLibraryInvalidation>,
) {
  function tool<A, E>(
    program: Effect.Effect<A, E, AppServices | LibraryInvalidation>,
    signal: AbortSignal,
  ) {
    return runtime
      .runPromiseExit(program.pipe(Effect.provideService(LibraryInvalidation, cache)), { signal })
      .then((exit) =>
        Exit.isSuccess(exit)
          ? { content: [{ type: "text" as const, text: JSON.stringify(exit.value) }] }
          : {
              isError: true,
              content: [{ type: "text" as const, text: failure(exit.cause).message }],
            },
      );
  }
  return createMcpHandler(
    () => {
      const server = new McpServer(
        { name: "Chronicon", version: "0.2.0" },
        { instructions: agentInstructions(origin, principal.ownerId) },
      );
      server.registerTool(
        "list_projects",
        {
          description: "List private projects available to this agent.",
          inputSchema: standard(Schema.Struct({})),
          annotations: { readOnlyHint: true },
        },
        (_input, ctx) =>
          tool(
            readCachedLibrary(principal).pipe(Effect.map((library) => library.projects)),
            ctx.mcpReq.signal,
          ),
      );
      server.registerTool(
        "read_document",
        {
          description:
            "Read HTML and revision history by document ID, or saved project reference plus document slug. Pass the current revision to upsert_document when updating.",
          inputSchema: standard(
            Schema.Struct({
              id: Schema.optionalKey(Schema.NonEmptyString),
              project: Schema.optionalKey(projectReference),
              slug: Schema.optionalKey(slugSchema),
              revision: Schema.optionalKey(revisionNumber),
            }).check(
              Schema.makeFilter((input) =>
                input.id !== undefined
                  ? input.project === undefined && input.slug === undefined
                  : input.project !== undefined && input.slug !== undefined,
              ),
            ),
          ),
          annotations: { readOnlyHint: true },
        },
        (input, ctx) =>
          tool(
            Effect.gen(function* () {
              if (input.id)
                return yield* readDocumentByReference(principal, {
                  id: input.id,
                  ...(input.revision === undefined ? {} : { revision: input.revision }),
                });
              if (input.project && input.slug)
                return yield* readDocumentByReference(principal, {
                  project: input.project,
                  slug: input.slug,
                  ...(input.revision === undefined ? {} : { revision: input.revision }),
                });
              return yield* new AppError({
                status: 400,
                message: "Provide a document ID or a project reference and document slug.",
              });
            }),
            ctx.mcpReq.signal,
          ),
      );
      server.registerTool(
        "upsert_document",
        {
          description:
            "Create or update self-contained HTML. Use light/dark CSS variables with @media (prefers-color-scheme: dark) and :root { color-scheme: light dark }; previews follow Chronicon's theme automatically. Project: use {id} from the repository association; on first use, {slug,name} creates the project if missing (requires workspace-wide write access). Project creation and publishing are atomic. expectedRevision=0 creates a document; read_document first for updates. Identical retries do not create revisions. Save the returned association in the Git common directory as instructed at initialization.",
          inputSchema: standard(publishInput),
          annotations: { idempotentHint: true, destructiveHint: false },
        },
        (input, ctx) =>
          tool(
            Effect.gen(function* () {
              const result = yield* publishDocument(principal, input);
              return {
                association: result.association,
                id: result.document.id,
                revision: result.document.revision,
                created: result.created,
                unchanged: result.unchanged,
                url: result.url,
              };
            }),
            ctx.mcpReq.signal,
          ),
      );
      server.registerTool(
        "find_documents",
        {
          description:
            "Find up to 20 documents, optionally filtered by saved project ID or slug. Omit query to browse recently updated documents; supply query for fuzzy search across titles, projects, tags, summaries and text. Use read_document with project and slug when the document is already known.",
          inputSchema: standard(
            Schema.Struct({
              query: Schema.optionalKey(
                Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
              ),
              project: Schema.optionalKey(projectReference),
            }),
          ),
          annotations: { readOnlyHint: true },
        },
        (input, ctx) => tool(findDocuments(principal, input), ctx.mcpReq.signal),
      );
      server.registerTool(
        "read_project_design",
        {
          description:
            "Read a project's design.md, settings, light/dark tokens and revision on demand for design work.",
          inputSchema: standard(readDesignInput),
          annotations: { readOnlyHint: true },
        },
        (input, ctx) => tool(readProjectDesign(principal, input), ctx.mcpReq.signal),
      );
      server.registerTool(
        "update_project_design",
        {
          description:
            "Save theme settings and/or design guidance with the current expectedRevision (0 for defaults). Full markdown may edit guidance outside its generated block; use settings to change tokens. Read and reconcile conflicts before retrying.",
          inputSchema: standard(updateDesignInput),
          annotations: { destructiveHint: false },
        },
        (input, ctx) => tool(updateProjectDesign(principal, input), ctx.mcpReq.signal),
      );
      return server;
    },
    { legacy: "stateless" },
  );
}
const handle = Effect.fn("Mcp.handle")(function* (
  request: Request,
  cache: ReturnType<typeof requestLibraryInvalidation>,
) {
  const config = yield* AppConfig;
  const origin = request.headers.get("origin");
  if (origin && origin !== config.origin)
    return yield* new AppError({ status: 403, message: "Origin not allowed." });
  if (
    !request.headers.get("authorization")?.startsWith("Bearer chronicon_") &&
    !request.headers.has("x-api-key")
  )
    return yield* new AppError({
      status: 401,
      message:
        "Add an agent API key as an Authorization: Bearer chronicon_… header. Create a key in Settings.",
    });
  const principal = yield* authenticate(request.headers);
  // Bound the body before letting the SDK parse JSON and classify protocol errors.
  const body = yield* readBody(request);
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body,
    signal: request.signal,
  });
  return yield* Effect.tryPromise({
    try: () => handler(principal, config.origin, cache).fetch(boundedRequest),
    catch: () => new AppError({ status: 400, message: "Invalid MCP request." }),
  });
});
export function mcpRoute(request: Request) {
  const cache = requestLibraryInvalidation();
  return runtime.runPromiseExit(handle(request, cache), { signal: request.signal }).then((exit) => {
    if (Exit.isSuccess(exit)) {
      for (const [name, value] of Object.entries(privateHeaders))
        exit.value.headers.set(name, value);
      return exit.value;
    }
    const error = failure(exit.cause);
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: error.message } },
      { status: error.status, headers: privateHeaders },
    );
  });
}
