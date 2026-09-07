# Chronicon

A private library for HTML plans, reports, and references. Publish from the browser or an agent, group documents by project, search their text, and keep every revision at one private URL.

## Stack

Next.js App Router with React Compiler and Cache Components; custom shadcn components on Base UI; cmdk; Better Auth email/password and scoped agent keys; Effect v4 services and SQL with Postgres; private Vercel Blob; MiniSearch in a browser worker; Sugar High. Bun, TypeScript 7, Oxlint, Oxfmt, and Effect language service are configured. No OAuth, ESLint, or Prettier.

## Effect architecture

Application workflows use Effect `4.0.0-rc.112`, following the matching [Effect repository examples](https://github.com/Effect-TS/effect/blob/main/LLMS.md). The Bun platform package is pinned to the same release.

- `src/lib/model.ts` defines Effect schemas for requests, domain records, and responses. REST, MCP, and the browser share them. MCP exposes them through Standard Schema and Standard JSON Schema adapters.
- `src/server/runtime.ts` composes configuration, database, storage, authentication, and search layers into one managed runtime per warm process. Next.js routes and server components are execution boundaries.
- Domain actions compose `Effect.fn` and generators. Application queries use `@effect/sql-pg`, `SqlSchema` decodes database rows, and `sql.withTransaction` owns transaction connections and commit/rollback. Effect and Better Auth share one scoped `pg` pool capped at three connections per warm process. Better Auth's supported Postgres adapter still uses Kysely internally; application code has no Kysely dependency or query wrappers.
- Bun platform layers provide Effect filesystem, path, and cryptography services to Next.js and local commands. UUIDs and SHA-256 hashes use the Crypto service. Effect Stream reads request bodies within the 3 MB limit and cancels readers on completion or failure.
- Publishing finishes its transaction and cache invalidation before honoring cancellation. Failed writes clean up their uploaded file. An uncertain commit result preserves the file because the database may have committed successfully. Requests are never automatically retried when they could create a revision or agent key.
- REST and MCP bind Next.js cache invalidation to the incoming request before entering Effect, then provide it as a request-scoped service. This keeps database continuations from registering invalidation against a render or another request. Do not move this service into the shared runtime layer.
- Configuration secrets and terminal passwords use `Redacted`. Expected failures have schema-tagged error types. Raw SDK errors, SQL parameters, passwords, and HTML are excluded from application error logs and HTTP responses.
- Browser actions decode responses from the Effect HttpClient service. `useTask` in `src/client/runtime.ts` cancels reads and subscriptions when their view is hidden or unmounted. `runAction` bridges writes to React Actions, keeping transitions pending until the Effect finishes. Effect scopes own polling listeners, worker listeners, worker termination, and download URLs. Pure filtering, formatting, and rendering remain ordinary functions.
- Local commands use `BunRuntime` and scoped layers. Owner creation uses `Prompt.hidden`, checks both entries, hashes the password with Better Auth, and disposes the database when the command finishes. It has no HTTP signup equivalent.

There is no database schema change for this migration. Existing reports, revisions, accounts, and keys keep their current storage format.

## Frontend

The interface uses shared Base UI shadcn controls, TanStack Form, and self-hosted
Departure Mono typography. Reusable controls and styles live in `src/components/ui`.

Workspace pages use App Router paths: `/` for all documents, `/starred`, `/archive`,
`/projects/[slug]`, and `/documents/[id]`. The `(workspace)` route group shares one
authenticated layout. `Workspace` keeps the sidebar, search worker, shortcuts, and
dialogs mounted while Next.js changes the page. `LibraryView` handles list filters.
Document pages resolve their heading from the authorized library and stream the
HTML and revision history through Suspense. Changing revisions keeps the current
report visible while the authenticated API loads the selected HTML.

Navigation uses Next.js links and the router's navigation methods. Links preserve
native browser behavior, including opening in another tab. Route loading, error,
and not-found boundaries handle server work. Cache Components preserves recently
visited views and their local state. Private page loaders use `use cache: private`
with a five-minute browser reuse window; they still authenticate on every server
render and are never cached on the server. Partial prefetching reuses the shared
workspace shell; hovering or focusing a navigation link requests its remaining
data. This avoids eagerly loading every document's HTML.

Library refreshes merge data in a React transition without clearing the route
cache or replacing the visible page. Stars and archive changes use `useOptimistic`
across the sidebar, lists, and document header, with rollback and an error if saving
fails. Publishing and project creation keep their forms pending until the server
confirms the result, then close and navigate in the same transition. Newer confirmed
documents take precedence over older background responses.

Each page also verifies its session, because a shared layout can remain mounted
across navigation. Pages own sign-in redirects and preserve the destination path;
the layout renders workspace navigation only for an authenticated owner. Keeping
redirects in pages lets protected metadata resolve without a competing layout redirect.
The sign-in page checks the same request-scoped principal and
redirects an authenticated owner to `/`. It never treats cookie presence as proof
of authentication. After Better Auth revokes the session, sign-out uses a full
`location.replace` navigation to clear Next.js's preserved private state. Other tabs
receive a credential-free storage event; browser back/forward-cache restoration
reloads the page for fresh authorization. No proxy database lookup or client
session polling is added. This follows the [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
and [Next.js guidance on authentication with preserved UI state](https://nextjs.org/docs/app/guides/preserving-ui-state#state-and-authentication).

## Code structure

- `src/server/actions/` owns project and document workflows, scoped access, owner checks, agent keys, and search visibility. SQL reads and writes stay with these domain actions. Publishing owns revision conflicts, upload cleanup, and cache invalidation; REST and MCP invoke the same action.
- `src/server/services/` contains storage, search-index caching, and JSON hashing operations. These accept explicit inputs, return values or typed failures, and do not query or mutate application tables. For example, storage returns an absent file as `Option.none()`; the document action chooses the user-facing error.
- `src/client/actions/` owns browser workflows, input and response validation, session redirects, and user-facing errors. `src/client/services/api.ts` only sends HTTP requests and returns status and data. React components invoke actions through `useTask` or the `runAction` bridge for React Actions.
- `src/app/`, `src/server/pages.ts`, `src/server/http.ts`, `src/server/mcp.ts`, and `src/server/cache.ts` adapt Next.js or MCP to the actions. Page loaders authenticate on the server and use request-scoped React `cache` to deduplicate reads shared by layouts, pages, and metadata. Configuration, database pool ownership, and Better Auth setup remain at the server composition boundary. Local provisioning stays under `scripts/`, outside the application routes.
- `src/lib/` holds shared schemas and UI helpers. Domain-specific operations used by one workflow remain with that action; extract a service when multiple callers share operational mechanics.

Actions here are ordinary Effect programs, not Next.js `"use server"` exports. They run behind the existing authenticated route and server-component boundaries.

Plans, reports, reviews, and design documents are published through Chronicon.
`docs/` is ignored local staging for uploads. Repository setup and contributor
instructions stay in this README and `AGENTS.md`.

## Local setup

Prerequisites on macOS and Linux: Bun 1.4.2 or newer, Node.js 24 or newer for Portless, and OpenSSL. Next.js runs under Bun. Portless is a pinned development dependency installed with the project; no global installation or personal Portless configuration is required.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
```

Set `OWNER_EMAIL` to your email, `BETTER_AUTH_SECRET` to a random secret of at least 32 characters, and `DATABASE_URL` to your personal Postgres connection. The database URL is required in every environment. Hosted database connections verify the TLS certificate and hostname. Leave the Blob token empty to store local uploads in `.chronicon/blobs`. Generate a secret with:

```sh
bun -e 'console.log(crypto.randomUUID() + crypto.randomUUID())'
bun run db:migrate
bun run owner:create
bun run dev
```

Run `bun run owner:create` in your own terminal. It reads the account email from `OWNER_EMAIL`, asks for your password twice with terminal echo disabled, hashes it locally with Better Auth, and writes only the salted hash to the database. Use 12–128 characters. It accepts no password arguments or password environment variables, and never saves or prints your password. Then open the Chronicon URL printed by `bun run dev` and sign in.

After the database and owner setup above, `bun run dev` serves the app at `https://chronicon.localhost`. The command starts or reuses the shared HTTPS proxy on port 443, pins `.localhost` routing to loopback, and assigns Next.js a free internal port. It does not inherit an old proxy port such as 1355 or silently fall back to a URL containing a port number. Other apps share the proxy using distinct names; Git worktrees receive branch-prefixed hostnames. There are no per-app port assignments, DNS configuration files, or certificate paths to maintain.

On first launch, run the command in an interactive terminal and approve Portless's OS prompts to bind port 443 and trust its local certificate authority. These permissions may be needed again after the proxy stops or the machine restarts. This is an OS requirement on supported macOS/Linux setups, not an application signup or configuration step. Only the proxy is elevated; do not run `sudo bun run dev`. If port 443 belongs to another service, resolve that conflict first; the dev command will not replace that service. Portless supports certificate trust setup on Debian/Ubuntu, Arch, Fedora/RHEL/CentOS, and openSUSE; custom Linux trust stores may need manual setup.

Next.js allows the exact development hostname, and authentication uses Portless's `PORTLESS_URL` in development. Production continues to require `BETTER_AUTH_URL`. Keep your existing `.env.local` when switching to Portless; no credential changes are needed. Use `bunx --no-install portless list` to inspect routes and `bunx --no-install portless doctor` to check the proxy. The Bash launcher in `scripts/dev.sh` finds Node on `PATH`, skipping Bun's runtime override, and uses it explicitly for Portless. Next.js still runs on Bun. Portless's TLS hostname selection requires Node; running the proxy under Bun can serve the wrong certificate even when `portless doctor` passes. A fresh clone still needs its own database, auth secret, and owner account as described above; `bun run dev` never provisions credentials automatically.

If an older setup already started Portless under Bun, stop the dev command with Ctrl+C, run `bunx --no-install portless proxy stop` in your terminal, then run `bun run dev` again. Stopping the shared proxy briefly interrupts any other apps using it. Reload the browser and check that the connection is secure; never bypass a certificate warning.

Public signup is permanently disabled, including before the owner exists. There is no setup key, signup flag, or one-time production route to remove. The command refuses to alter an existing account or password; user and credential creation happen in one transaction. The email is an account identifier; no email provider or verification message is required. Database administration access authorizes local provisioning.

Local HTML files live in `.chronicon/blobs`, excluded from Git. Local file storage is disabled in production. Removing the old embedded database integration does not delete existing `.chronicon/` files; the app now reads only the configured Postgres database. Existing hosted accounts need no provisioning or schema migration for this change.

## Personal Vercel deployment

1. Import this project into your personal Vercel **Hobby** account. This project must remain on free plans; do not enable Pro, paid trials, or usage-based add-ons.
2. Add **Neon Free** from Storage / Marketplace, using your personal account. Connect its pooled Postgres URL as `DATABASE_URL`.
3. Create and connect a **private** Vercel Blob store.
4. Configure the variables below, using your final HTTPS site origin.
5. On your own computer, set `DATABASE_URL` in private `.env.local` to that hosted database and set `OWNER_EMAIL` to match Vercel. Run `bun run db:migrate`. Reuse the existing owner; run `bun run owner:create` only for an empty database. Only the password hash is sent to the database; the password is entered locally. If reports were published with local file storage, configure the private Blob token locally and run `bun run storage:upload` to copy and verify their revisions without changing database records. Migrations, account creation, and file transfers never run during builds.
6. Deploy and sign in. Signup stays disabled throughout; no cleanup deployment is needed.

| Variable                | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`          | Hosted Postgres connection with provider-configured SSL/pooling      |
| `BLOB_READ_WRITE_TOKEN` | Server-only token for a **private** Blob store                       |
| `BETTER_AUTH_URL`       | Canonical HTTPS site origin                                          |
| `BETTER_AUTH_SECRET`    | Random secret, stable across deployments                             |
| `OWNER_EMAIL`           | Owner identifier used by the local command and backend access checks |

Keep production credentials out of preview deployments unless those previews should access production reports. `vercel.json` selects the [Bun 1.4 runtime](https://vercel.com/docs/functions/runtimes/bun), available in beta on all Vercel plans, including Hobby. Next.js development, build, and start commands also run under Bun. Hosted resources and a live deployment are not created by this repository itself.

## Free plan budget

Stay on Vercel Hobby and Neon Free. As checked on September 6, 2026, [private Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing) includes 1 GB storage, 2,000 advanced operations, 10,000 simple operations, and 10 GB transfer in its free allowances. [Neon Free](https://neon.com/pricing) includes 0.5 GB storage and 100 CU-hours per project per month. Every HTML revision uses storage and an upload operation. These are capped free services: exceeding allowances can interrupt access. Do not enable paid upgrades. There is no paid search, analytics, email, or auth dependency.

## Agent access

Open **Connect an agent**, choose a project or all projects, choose read-only or publishing access, and create a key. Copy it before closing; the full key is shown only once. Keep it in your client's secret configuration. Agents never need your owner password.

Use an HTTP MCP client that accepts a custom bearer header. For clients supporting this JSON format:

```json
{
  "mcpServers": {
    "chronicon": {
      "type": "http",
      "url": "https://YOUR_SITE/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_AGENT_KEY" }
    }
  }
}
```

Clients that only support OAuth connectors need a different client configuration or the REST API. Each key permits 120 requests per minute and can be expired or revoked immediately.

| Tool              | Behavior                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `list_projects`   | Choose an accessible project when initially linking a repository                                                                  |
| `find_documents`  | Recent documents when query is omitted; fuzzy search when supplied. Optional project `{id}` or `{slug}`; returns up to 20 results |
| `read_document`   | HTML and revision history by document `id`, or `project` reference plus document `slug`; optional `revision`                      |
| `upsert_document` | Create/reuse a project and create/update its document in one transaction; returns a viewer URL and repository association         |

Example first `upsert_document` call (also accepted by `POST /api/documents`):

```json
{
  "project": { "slug": "my-project", "name": "My project" },
  "slug": "implementation-plan",
  "title": "Implementation plan",
  "kind": "plan",
  "html": "<!doctype html><html lang=\"en\"><h1>Implementation plan</h1><p>Start here.</p></html>",
  "expectedRevision": 0
}
```

A missing project is created only with workspace-wide publishing access and
`expectedRevision: 0`. An existing project's name/description is preserved. A scoped
key may publish only into its authorized projects. Failed publishing rolls back new
project creation too. No schema migration is needed.

The result includes `id`, `revision`, `created`, `unchanged`, `url`, and `association`.
For subsequent calls, use `"project": { "id": "saved-project-id" }`.
Read an existing document directly with `{"project":{"id":"saved-project-id"},
"slug":"implementation-plan"}`, then pass its current revision to upsert.
Conflicts prevent overwrites; identical retries reuse the existing revision.
Summary, kind and tags default to empty, report and empty respectively: updates
replace the full document payload, so include metadata you intend to retain.

### Repository association

MCP initialization includes instructions for agents with local file and Git access.
Resolve the shared directory with:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

Store the returned `association` object as `chronicon/project.json` inside that
directory. Its version-1 fields are `server`, `workspaceId`, `projectId`, and
`projectSlug`, alongside `version`. All linked worktrees use the same file. It is
outside tracked files, needs no ignore rule, and survives dependency/cache cleanup.
It contains no credentials. Match both server and workspace before reusing the ID.

The association is a local preference, not an authorization boundary. Someone able
to edit it could redirect an agent to a different project that its key already
permits. Use a project-scoped key for repository-specific access. Backend checks
remain authoritative on every call. MCP and REST reject unknown input fields,
including a mixture of project ID and project creation fields.

Write through a unique temporary file in the same directory and atomically install
it without replacing an existing association. If another agent linked the repository
first, reuse its identical association or report a conflict. Replacing a different
association requires explicit relinking. Never recover an inaccessible saved ID by
silently creating a new project. Fresh clones link once again.

This storage happens on the agent's machine; the hosted MCP server cannot write it.
Clients must deliver initialization instructions and provide local file/Git tools.
Agents without those tools should report that persistence is unavailable. Remote-only
MCP clients can still use every tool, but must supply their project reference each time.

Reconnect existing MCP clients after upgrading: `upsert_document` replaces
`create_project` and `publish_document`; `find_documents` replaces `list_documents`
and `search_documents`. No compatibility aliases expand the tool list.

REST keeps `POST /api/documents` as the same upsert workflow and input schema. The
browser also publishes by project ID. It returns the document, project, association,
creation/retry flags, and viewer URL. Existing UI routes (`GET /api/library`,
`POST /api/projects`, `GET /api/documents/:id?revision=1`) remain available; MCP exposes
only the four tools above. Agents cannot manage keys or change archive/star preferences.
Limits: 2 MB HTML and 3 MB serialized JSON per request.

## Search and privacy

Authenticated library data is cached by owner and project access. A browser worker builds the fuzzy search index; typing makes no network requests or database queries. Publishing invalidates the library cache. Active, visible tabs refresh once per minute and on focus; polling pauses after two minutes without interaction so an abandoned tab does not keep Neon awake. MCP searches the cached library in server memory. Authentication and publishing still use the database.

MCP retains up to eight built indexes for ten minutes in Effect Cache. Each key is a SHA-256 digest of the authorized library snapshot, so changed documents or access scopes select a different index. The library cache still controls when updates from other server instances become visible.

The initial index contains extracted text from all accessible documents. This fits a personal library; very large collections would need incremental indexing and paginated browsing. Search data remains in tab memory rather than persistent browser storage.

Text extraction preserves word boundaries between HTML blocks, table cells, and line breaks. To refresh search text for an older report, republish its current HTML and metadata unchanged. This rebuilds its search text without creating a revision or uploading another file.

All report/API reads require a session or agent key. The backend checks the configured owner on session creation, each authenticated app request, and each agent-key request. Changing the configured owner invalidates access from previous-owner sessions and keys. There are no public links. HTML lives in private storage and loads through authenticated routes. Previews use an opaque sandbox origin with inline scripts, without same-origin access, forms, popups, or top-level navigation. CSP blocks fetches and external scripts, styles, images, and embedded frames. Use self-contained HTML with inline code and embedded assets. Treat agent HTML as code you authorize: browser self-navigation is not universally restricted by CSP, and the sandbox is not a malware analysis environment.

Each revision preserves immutable HTML. Document metadata describes the latest revision. Old HTML can be viewed or downloaded. Failed database writes attempt to remove unused uploads; abrupt process termination may leave an orphaned private blob.

## Checks and editor

`bunfig.toml` enables Bun's [default runtime setting](https://bun.sh/docs/runtime/bunfig#run-bun-auto-alias-node-to-bun) for project scripts, including executables with Node shebangs. Run scripts with `bun run <script>`; no runtime flags are needed.

```sh
bun run format:check
bun run lint
bun run typecheck
bun run build
bun run doctor
```

The install hook runs `effect-tsgo patch --oxlint`, following the [Effect Oxlint setup](https://effect.website/docs/v4/getting-started/devtools#oxlint). It patches both TypeScript and Oxlint. TypeScript `7.0.2`, `@effect/tsgo` `0.41.0`, Oxlint `1.81.0`, and `oxlint-tsgolint` `7.0.2001` are pinned to a compatible set; upgrade them together using the Effect integration's supported-version list.

The root Oxlint config enables [type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware.html), extends Effect's recommended preset, and rejects floating/misused promises and unsafe typed operations. Effect diagnostics run through Oxlint; `diagnostics: false` in the TypeScript plugin avoids duplicate editor reports. The plugin name remains `@effect/language-service` as required by `@effect/tsgo`; the old package is no longer installed. Both lint and typecheck run `next typegen` first so Next.js route types exist on a fresh checkout. Builds run lint first, then Next's native TypeScript 7 checker. Narrow inline exceptions cover Next's required async framework boundaries.

Install the recommended Oxc and [TypeScript 7 editor extensions](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview), then select workspace TypeScript. `.vscode/settings.json` enables the native server and Oxc formatting. Oxc inherits type-aware mode from the root config.

For Zed, use the [Oxc](https://github.com/oxc-project/oxc-zed) and [Effect Language Service (tsgo)](https://github.com/RATIU5/zed-effect-tsgo) extensions. Open `chronicon/` as the project root after running `bun install --frozen-lockfile`. `.zed/settings.json` launches the workspace's Effect-patched TypeScript 7, Oxlint, and Oxfmt through Bun. It enables formatting and safe lint fixes on save, disables competing TypeScript servers and ESLint, and keeps Prettier disabled. Effect diagnostics come from the shared Oxlint configuration; TypeScript supplies completion, navigation, and refactoring without duplicate Effect diagnostics.

`bun run doctor` runs Vercel Doctor 1.2.0 locally with telemetry disabled; offline scans do not calculate a score. The audit removed unused UI code and its root provider and replaced the starter favicon with a small SVG. Workspace links use Next.js partial prefetching and load destination data on hover or focus. `vercel.json` explicitly enables Fluid Compute for deployment.

The command resolves Doctor through `bunx`; this review used version 1.2.0 on
September 8, 2026. `bunx` downloads it if it is not cached. The `--offline` flag
disables Doctor's remote scoring; it does not make that initial package download
offline. Keeping this audit tool outside the app's dependencies avoids adding its
separate TypeScript 5 and lint-tool dependency tree to the project install.

Eight Doctor advisories remain visible. Two concern default link prefetching: the shared navigation link and brand reuse cached shells. `NavigationLink` also enables full destination prefetching on intent. Four GET-route warnings cannot follow the shared `privateHeaders` in `src/server/http.ts`: every response already uses `Cache-Control: private, no-store`. Library data is cached internally only after authorization. Do not add public/CDN caching to these routes. Another advisory counts API routes and recommends Fluid Compute without checking `vercel.json`; it is already enabled. The remaining warning flags the 22 KB Departure Mono WOFF2 file. It is intentionally self-hosted through `next/font/local`; moving this small font to another storage service would add infrastructure without a meaningful benefit. No Doctor rules are suppressed.

This repository has a strict no-tests policy. Do not add or run automated tests, test frameworks, smoke scripts, or temporary test harnesses. Use code review and manual browser use alongside the checks above. Authenticated browser verification requires an existing owner account; do not create credentials or enable signup just for verification.

## Credentials and open source

The local owner command uses [Better Auth’s password hashing](https://better-auth.com/docs/authentication/email-password#password-hashing) before storing credentials. The database stores a salted scrypt hash. The password stays in the local process during setup; it is never written to source, environment configuration, command arguments, or authentication responses. Later sign-ins send the password to Better Auth over HTTPS for verification against that hash.

`OWNER_EMAIL` is server-only deployment configuration, with an empty placeholder in `.env.example`. The frontend does not contain the configured address or decide who is allowed access. Agent API keys are hashed by Better Auth and shown once at creation. Signing secrets and database/Blob credentials must remain available to the server through private environment configuration; they are separate from user passwords.

Commit `.env.example` with empty placeholders. Keep actual `.env` files, `.chronicon/` databases and reports, `.vercel/` credentials, build artifacts, and key files out of Git. `.vercelignore` also excludes local credentials and report files from CLI source uploads. Configure hosted credentials through Vercel environment variables, never `NEXT_PUBLIC_` variables. Open-sourcing code does not require publishing deployment configuration or data. Before publishing a repository, review both staged files and any existing Git history for secrets.
