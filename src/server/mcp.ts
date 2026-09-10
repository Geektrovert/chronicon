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
import { type AppServices } from "./runtime";
import { runObservedRequest, runObservedTool, telemetryResponseHeaders } from "./request-telemetry";

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
    name: string,
    program: Effect.Effect<A, E, AppServices | LibraryInvalidation>,
    signal: AbortSignal,
  ) {
    return runObservedTool(
      name,
      program.pipe(Effect.provideService(LibraryInvalidation, cache)),
      signal,
    ).then((exit) =>
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
            "list_projects",
            readCachedLibrary(principal).pipe(Effect.map((library) => library.projects)),
            ctx.mcpReq.signal,
          ),
      );
      server.registerTool(
        "read_document",
        {
          description:
            "Read HTML and revision history by document ID, or project reference and document slug. Use the current revision as expectedRevision in upsert_document.",
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
            "read_document",
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
            "Create or update self-contained HTML. Use CSS variables with light defaults, @media (prefers-color-scheme: dark) overrides, and :root { color-scheme: light dark }; previews follow Chronicon's theme. Use project {id} from the saved association, or {slug,name} to create a missing project with workspace-wide write access. Creation and publishing are atomic. expectedRevision=0 creates a document; read_document first for updates. Identical retries add no revision. Save the returned association as instructed at initialization.",
          inputSchema: standard(publishInput),
          annotations: { idempotentHint: true, destructiveHint: false },
        },
        (input, ctx) =>
          tool(
            "upsert_document",
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
            "Find up to 20 documents, optionally filtered by project ID or slug. Omit query for recent documents; supply it to search titles, projects, tags, summaries, and text. For a known document, use read_document directly.",
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
        (input, ctx) => tool("find_documents", findDocuments(principal, input), ctx.mcpReq.signal),
      );
      server.registerTool(
        "read_project_design",
        {
          description:
            "Read a project's design.md, settings, light/dark tokens and revision on demand for design work.",
          inputSchema: standard(readDesignInput),
          annotations: { readOnlyHint: true },
        },
        (input, ctx) =>
          tool("read_project_design", readProjectDesign(principal, input), ctx.mcpReq.signal),
      );
      server.registerTool(
        "update_project_design",
        {
          description:
            "Save settings or design guidance with the current expectedRevision, using 0 before the first save. In full markdown, edit only guidance outside the generated block; change tokens through settings. On conflict, read and merge before retrying.",
          inputSchema: standard(updateDesignInput),
          annotations: { destructiveHint: false },
        },
        (input, ctx) =>
          tool("update_project_design", updateProjectDesign(principal, input), ctx.mcpReq.signal),
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
        "Send an Authorization: Bearer chronicon_… header. Create the key from Connect an agent in your workspace.",
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
    catch: () =>
      new AppError({
        status: 400,
        message: "Invalid MCP request. Check the tool name and input fields.",
      }),
  });
});
export function mcpRoute(request: Request) {
  const cache = requestLibraryInvalidation();
  return runObservedRequest(request.headers, request.method, "/api/mcp", handle(request, cache), {
    signal: request.signal,
  }).then(({ exit, state }) => {
    if (Exit.isSuccess(exit)) {
      return telemetryResponseHeaders(exit.value, state, privateHeaders);
    }
    const error = failure(exit.cause);
    return telemetryResponseHeaders(
      Response.json(
        { jsonrpc: "2.0", id: null, error: { code: -32000, message: error.message } },
        { status: error.status, headers: privateHeaders },
      ),
      state,
    );
  });
}
