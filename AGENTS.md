# Instructions for agents

## Verification policy

Strict no-tests policy. Do not add or run automated tests, test scripts, test frameworks, or temporary test harnesses, including for authentication or security changes.

Verify behavior through manual browser use and code review; build, typecheck, lint, and formatting checks are allowed.

## API design

Keep MCP and API interfaces small and workflow-oriented. Reuse domain actions across
transports. Prefer a single upsert workflow over separate required discovery/create/
publish steps. Preserve explicit authorization, revision conflicts, and transactional
boundaries when combining operations. MCP repository associations belong in Git's
common metadata directory, never dependencies or caches; keep credentials separate.

## Frontend conventions

Compose shared Base UI shadcn components from `src/components/ui`; add reusable
variants there instead of per-page control styles. Use TanStack Form for forms and
Effect for application actions. Keep labels and empty states concise and functional.

## Project documents

Publish plans, reports, reviews, and design documents through Chronicon. Keep
`docs/` as ignored local staging; do not commit its contents. Repository setup and
contributor instructions belong in `README.md` and `AGENTS.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
