# Instructions for agents

## Verification policy

Strict no-tests policy. Do not add or run automated tests, test scripts, test frameworks, or temporary test harnesses, including for authentication or security changes.

Verify behavior through manual browser use and code review; build, typecheck, lint, and formatting checks are allowed.

## Development commands

Use Bun and the committed lockfile. Keep hoisted workspace dependencies so Next.js
can resolve native external packages.

| Command                                          | Purpose                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `bun run dev`                                    | Start local HTTPS development with Portless                        |
| `bun run build`                                  | Lint, build the CLI, and build/typecheck the app                   |
| `bun run typecheck`                              | Generate route types and check TypeScript                          |
| `bun run lint`                                   | Generate route types and run type-aware Oxlint                     |
| `bun run format:check`                           | Check formatting with Oxfmt                                        |
| `bun run doctor`                                 | Run Vercel Doctor and React Doctor; report failure if either fails |
| `bun run doctor:react` / `bun run doctor:vercel` | Run one audit with its own options                                 |

Doctor versions are pinned through `bunx`; the first run may download packages.
Audits disable remote scoring and telemetry. React Doctor also disables Socket.dev
checks. Read findings against the source before changing code or suppressing rules.
Shared Effect scopes, private response headers, and React Compiler can affect the
tools' interpretation.

Portless runs on Node.js 24+ for correct TLS hostname handling; Next.js runs on Bun.
The launcher manages port 443 and `PORTLESS_URL`. Keep the existing `.env.local`.
Use `bunx --no-install portless list` or `bunx --no-install portless doctor` to
diagnose routing. If an older proxy runs under Bun, stop the dev command, run
`bunx --no-install portless proxy stop`, then restart `bun run dev`. Stopping the
shared proxy interrupts other local apps. Never bypass certificate warnings.

React Grab loads a pinned script from unpkg only in development. Keep its
`NODE_ENV` check static so production builds exclude it.

## Application boundaries

- `src/lib/model.ts` and `src/lib/project-design/model.ts` define shared schemas.
  REST, MCP, and browser actions use them; reject unknown input fields.
- `src/server/actions` owns SQL, authorization, revision checks, and transactions.
  Services own storage, search indexes, and hashing without querying application
  tables. Next.js routes and MCP handlers adapt these shared actions.
- `src/client/actions` owns browser workflows and response validation. `useTask`
  cancels reads and subscriptions; `runAction` keeps writes pending through React
  Actions. Effect scopes release listeners, workers, URLs, and connections.
- Pin all Effect packages to compatible releases. Share one scoped Postgres pool
  between Effect and Better Auth. Keep expected failures typed and secrets redacted.
- Bind cache invalidation to the incoming request before entering the runtime.
  Never put the request-scoped `LibraryInvalidation` service in the shared layer.

## API design

Keep MCP and API interfaces small and workflow-oriented. Reuse domain actions across
transports. Prefer a single upsert workflow over separate required discovery/create/
publish steps. Preserve explicit authorization, revision conflicts, and transactional
boundaries when combining operations. MCP repository associations belong in Git's
common metadata directory, never dependencies or caches; keep credentials separate.

Document updates replace the full HTML and metadata. Require `expectedRevision`:
`0` creates a document; updates use the current revision. Do not retry writes
automatically. Complete publishing and cache invalidation before cancellation;
clean up uploads after confirmed failures, but preserve them when the commit result
is uncertain.

Project designs save settings, resolved tokens, guidance, and revision together.
Guidance-only updates preserve saved tokens. The generated `design.md` block is
validated on write: changing its prose can invalidate exported files, so treat
format changes as compatibility work. Keep upstream credits and font licenses.

## Accounts and privacy

Public email/password signup creates an isolated private account. Authorize every
page and action from the current session or agent key, including project scope.
Cookie presence alone is not authentication. Agent keys cannot manage other keys,
stars, or archive state. CLI logout revokes only its own key.

Keep private API responses `Cache-Control: private, no-store`. Cache library data
only after authorization, keyed by account and scope. Preserve the preview sandbox,
its CSP, and source/origin validation for navigation messages.

Sign-out uses a full navigation to clear preserved private state. Other tabs receive
a credential-free event. Keep these behaviors when editing navigation or caching.
Browser verification uses an existing account; do not create verification accounts.

Keep credentials out of Git, HTML, URLs, logs, and project associations. Preserve
`.gitignore` and `.vercelignore` exclusions. Use separate preview credentials.
Stay on Vercel Hobby and Neon Free; do not enable paid plans or add-ons.

`OWNER_EMAIL` selects an account only for local administration. `bun run owner:create`
creates the first account in an empty database using a hidden password prompt.
`bun run storage:upload` copies and verifies local document files in private Blob
storage; it preserves local files and existing revisions. Neither command runs in
builds. Run `bun run db:migrate` against the intended database before deployment.

## Frontend conventions

Compose shared Base UI shadcn components from `src/components/ui`; add reusable
variants there instead of per-page control styles. Use TanStack Form for forms and
Effect for application actions. Keep labels and empty states concise and functional.

Use sentence case and the same action names in menus, help, and errors. Call the
content a "document"; "report" is one document type. Key management lives under
"Connect an agent", not Appearance settings. Errors should give a safe next step;
never suggest retrying an uncertain write without checking its saved result.

Departure Mono is for controls and metadata; Nacelle is for document text. Reuse
`content-title`, `content-title-sm`, and `content-description` from the shared
typography stylesheet. Keep font loading in the root layout.

Use Next.js links for navigation and prefetch destination data on intent. Keep the
shared workspace mounted so navigation preserves search, sidebar state, and design
drafts. Drafts keep their original revision until saved or explicitly discarded.
Register new project destinations in `src/components/project-navigation.tsx` so
the project header, directory, and search stay consistent.

## Project documents

Publish plans, reports, reviews, and design documents through Chronicon. Keep
`docs/` as ignored local staging; do not commit its contents. Repository setup and
contributor instructions belong in `README.md` and `AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
