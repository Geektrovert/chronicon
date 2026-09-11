# Chronicon

A team workspace for project plans, reports, and design systems.

Keep the documents you and your agents create in one searchable place. Update them
without losing earlier revisions, and give each project a shared design language.

[Open Chronicon](https://chronicon.klyk.work) · [CLI guide](packages/cli/README.md) · [Run locally](#run-locally)

## What you can do

- **Publish documents** from your browser, terminal, or AI agent.
- **Find what you need** with full-text search, projects, tags, stars, and an archive.
- **Keep every revision** at one private link. View or download earlier versions.
- **Design by project** with live component previews, light and dark themes, and a reusable `design.md`.
- **Share projects or individual documents** with named people, or publish a read-only public link.

## Get started

1. [Create an account](https://chronicon.klyk.work/sign-up) with your email and password.
2. Choose **Create project** to group related documents.
3. Choose **Publish document**, upload an HTML file or paste its source, and preview it before publishing.

To update a document, open it and choose **Edit document**. Publishing adds a
revision and keeps the same link.

Documents use self-contained HTML, up to 2 MB. Include styles, scripts, and images
in the file; previews block external resources.

## Give each project a design system

Open **Projects**, then choose a project's **Design system**. Adjust colors, fonts,
icons, component styles, and corners while previewing real components. Compare light
and dark appearances, then choose **Save design**.

Use **Design guidance** to add project notes and download `design.md` for your
agents. Design changes stay local until saved. Saving a design does not restyle
documents you have already published.

## Work with agents

Choose **Connect an agent** in the sidebar. Select its projects, access level, and
expiration, then create a key. Copy the configuration into your agent's MCP settings
before closing; the key is shown only once. Revoke keys from the same dialog.

Agents can find and publish documents, read project designs, and update design
guidance. Your MCP client must support HTTP connections with a bearer token.

<details>
<summary>HTML guidance for agents</summary>

Use CSS variables with light defaults, dark overrides inside
`@media (prefers-color-scheme: dark)`, and `:root { color-scheme: light dark }`.
Previews then follow Chronicon's selected appearance automatically.

Read a document before updating it. Send its complete HTML and metadata with the
current `expectedRevision`; use `0` for a new document. Resolve revision conflicts
before saving again.

</details>

The [CLI guide](packages/cli/README.md) covers browser login, project linking,
publishing, and design updates. Use the local build until `@chronicon/cli` is
published on npm and JSR.

## Privacy and access

Every account starts with one default team. Team owners and admins can invite
members by email in **Settings → Team**. Switch between your team and teams you
have joined from the sidebar. Creating additional teams is not available.

New projects and documents are private. Joining a team does not give someone
access to its projects. Use **Share** on a project to add people, with one of three
permissions:

| Permission  | Allowed actions                |
| ----------- | ------------------------------ |
| Full access | View, edit, and manage sharing |
| Can edit    | View and edit content          |
| Can view    | Read content                   |

Documents inherit project access. You can also share a single document with a
guest without giving them access to its private project or other documents.
The broadest applicable permission wins. Removing a direct document grant does
not remove access inherited from the project. Stars belong to each user.

Sharing with an existing verified account grants access immediately. Other email
addresses receive an invitation to create an account or sign in, verify their
email, and accept. Invitations expire after seven days and can be cancelled.

Choose **Anyone with the link** in Share to make a project or document public.
Public projects expose their unarchived documents. A document published on its
own does not expose its private parent project. Public links show the current
revision, without editing controls or revision history. Setting a document back
to private still leaves it public if its project is public.

Public document links use `/<username>/d/<document-slug>-<identifier>`. Choose a
username in **Settings → Account**. Existing accounts receive a generated username
that discloses no email or account ID. Former usernames remain reserved to the
same account and redirect to its current username. The old
`/public/documents/<id>` links also redirect, after checking public access.

Each document keeps the slug and account namespace assigned when it was created,
plus a random 16-bit identifier written as four hexadecimal characters. The database
checks collisions within that account and slug and retries allocation. Editing,
transferring, archiving, or changing sharing does not rotate the stored address.
Public links always recheck current visibility. The identifier is not an access secret.

Public pages and previews declare `noindex`, `nofollow`, `noarchive`, `nosnippet`,
and `noimageindex`. `robots.txt` disallows public routes, and the request proxy denies
identified crawlers before reading document content. These are best-effort controls:
a scraper impersonating a browser can still fetch a public link. Use private sharing
when readers must authenticate.

The project creator keeps full access while in the team. Removing a team member
revokes their grants in that team and transfers projects they created there to
the team owner. Team and platform admin roles do not bypass content permissions.

Agent keys are limited to their issuing team and optional selected projects.
They cannot exceed the issuing user's current permissions. **Read, edit, and share**
keys can change a document's public-link access when the issuing user has a verified
email and full access. Existing **Read and edit** keys retain their original access.
Keys cannot manage named grants, project sharing, other keys, stars, or archive state.
Copying a private link does not grant access.

Choose Light, Dark, or System in [Appearance settings](https://chronicon.klyk.work/settings/appearance).
Appearance and keyboard shortcuts are saved in your browser.

Verify your email before accepting invitations or sharing with other people.
Password reset is not available yet. Keep your password somewhere you can retrieve it.

## Document API and MCP sharing

`POST /api/documents` and MCP `upsert_document` accept the same optional `sharing`
object alongside the existing HTML, metadata, and `expectedRevision` fields:

```json
{
  "project": { "id": "PROJECT_ID" },
  "slug": "release-notes",
  "title": "Release notes",
  "html": "<!doctype html><html lang=\"en\"><title>Release notes</title><body><p>Released today.</p></body></html>",
  "expectedRevision": 0,
  "sharing": { "visibility": "public", "expectedRevision": 0 }
}
```

Omitting `sharing` creates a document with private visibility and preserves visibility
on updates. Existing requests and response fields keep their meaning; sharing
information is additive. Unknown request fields, `sharing: null`, empty sharing
objects, and unsupported visibility values are rejected.

`GET /api/documents/:id` and MCP `read_document` return current `sharing`, including
`visibility`, `revision`, `inheritedPublic`, and `publicUrl`. Document mutations return
the same sharing shape. The existing `url` remains the authenticated viewer URL.
`sharing.publicUrl` is non-null only when the current, unarchived document is publicly
accessible. Public project access is inherited, so setting a document to private
does not revoke access granted by its public project. Named grants are independent.

For an existing document, use the returned `sharing.revision` as
`sharing.expectedRevision`. To change sharing without sending HTML, use
`PATCH /api/documents/:id` with:

```json
{ "sharing": { "visibility": "private", "expectedRevision": 1 } }
```

The MCP equivalent is `update_document` with `{id, sharing}`. The PATCH response
preserves the existing document fields and adds `sharing`; it still supports browser
stars and archive changes. Agent keys cannot modify those flags.

| Contract                     | Behavior                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Creation                     | Use `0` for the content revision and, when supplying sharing, its expected revision. Saved revisions start at `1`.                                                 |
| Content update               | Send full HTML and metadata with `document.revision` as the top-level `expectedRevision`.                                                                          |
| Sharing update               | Send `sharing.expectedRevision` from a fresh read. It guards direct document visibility, not named grants, archive state, or inherited project access.             |
| Atomicity                    | Content and requested sharing changes commit together. Authorization, validation, or revision failures save neither.                                               |
| No-op                        | Identical content-only retries retain the existing behavior. Explicit sharing always checks its revision, even if the requested visibility already matches.        |
| Revision history             | Sharing-only changes advance the sharing revision without uploading HTML or adding a content revision.                                                             |
| Conflict or uncertain result | Read the saved state and decide whether the change is still intended. A stale sharing request returns `409`; do not automatically replay it with a newer revision. |
| Access                       | A verified user with full access, plus `documents: ["read", "write", "share"]` for agent keys. Key team and project scope still apply.                             |

Create sharing-enabled keys through **Connect an agent → Read, edit, and share**, or
send `share: true` with `write: true` to the existing browser-authenticated key API.
Omitting `share` keeps key creation backward compatible. Standard CLI login continues
to issue read/edit keys. Named invitations and project sharing remain browser workflows.

The older `/api/sharing` visibility action remains compatible. Its document action
also accepts `expectedRevision`; the current browser supplies it. Older callers that
omit it retain their previous last-write-wins behavior, while every visibility change
still advances the document's sharing revision.

Public document addresses are returned through the existing `sharing.publicUrl`;
clients should use that value rather than construct a URL from a document ID.
Document IDs, revision preconditions, and private-by-default writes are unchanged.

Browser sessions can read `GET /api/account/profile` and update their username with
`PATCH /api/account/profile`, using `{ "username": "example", "expectedRevision": 1 }`.
Both return `{ "username": "example", "revision": 1 }`, with the revision advancing
on a change. Usernames use 3–40 lowercase ASCII letters, numbers, or hyphens, with
no leading, trailing, or consecutive hyphens. Reserved or claimed usernames and
stale revisions return `409`; invalid or unknown fields return `400`. Updates require
a verified email and same-origin browser session. Agent keys cannot manage usernames.

## Run locally

<details>
<summary>Set up a local workspace</summary>

Requires Bun 1.4.2+, Node.js 24+, OpenSSL, and Postgres on macOS or Linux.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
```

Set `DATABASE_URL` to your Postgres URL and `BETTER_AUTH_SECRET` to a random secret
of at least 32 characters. Leave `BLOB_READ_WRITE_TOKEN` empty to store local files
in `.chronicon/blobs`.

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to send verification and invitation
emails. The sender must use a domain verified in your Resend account. Existing
accounts can sign in without email delivery configured; signup and invitations
need working email delivery.

```sh
bun -e 'console.log(crypto.randomUUID() + crypto.randomUUID())'
# Copy the generated secret into .env.local, then:
bun run db:migrate
bun run dev
```

Open the URL printed by the dev command, normally `https://chronicon.localhost`.
On first launch, Portless may ask for permission to use port 443 and trust its local
certificate. Run it in your terminal; do not run the app with `sudo`.

[React Grab](https://github.com/aidenybai/react-grab) is available in development.
Hover an element and press Cmd+C or Ctrl+C to copy its source context for an agent.

</details>

<details>
<summary>Host your own workspace</summary>

Deploy to Vercel with Postgres and a **private** Vercel Blob store. This repository
targets Vercel Hobby and Neon Free; check their current limits before deploying.

| Environment variable    | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`          | Postgres connection URL                                              |
| `BLOB_READ_WRITE_TOKEN` | Token for your private Blob store                                    |
| `BETTER_AUTH_URL`       | Your site's HTTPS origin                                             |
| `BETTER_AUTH_SECRET`    | A stable random secret of at least 32 characters                     |
| `RESEND_API_KEY`        | Resend API key for sending email                                     |
| `RESEND_FROM_EMAIL`     | Sender on a verified domain, such as `Chronicon <hello@example.com>` |

Coordinate the team migration with the app release. The migration assigns
existing projects to their creators' default teams and keeps every project and
document private. Older app versions cannot create projects after the new team
constraint is applied. Pause writes, run `bun run db:migrate` against the target
database, then start the updated app before reopening writes.

For the document-sharing API update, run `bun run db:migrate` before deploying the
app. It adds `document.sharingRevision` at `1` without changing visibility or HTML.
A database trigger advances it whenever direct visibility changes, including writes
from older app instances during rollout. The migration can be rerun and is compatible
with the previous app version. Keep the column and trigger if rolling the app back.

Local file storage is unavailable in production. Keep secrets in environment
configuration and use separate credentials for preview deployments.

</details>

## Observability

Chronicon uses the existing US PostHog project `555830`, named Unthink. All events
carry `app=chronicon`; logs and traces also use `service.name=chronicon`. The
[Chronicon dashboard](https://us.posthog.com/project/555830/dashboard/2084739)
has a saved app filter. Keep that filter when creating insights in the shared
project. Person IDs use `chronicon:user:<account-id>` and browser persistence is
specific to Chronicon.

Set `NEXT_PUBLIC_POSTHOG_KEY` to that project's public `phc_` token and
`NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com` locally and at build time on
Vercel. The public token supports product events, exceptions, OTLP logs and
distributed traces. Collection defaults to production builds. Set
`NEXT_PUBLIC_POSTHOG_ENABLED=true` for a manual local session or `false` to
disable collection. Vercel's deployment environment and commit SHA distinguish
preview traffic and releases; self-hosted builds can set `NEXT_PUBLIC_APP_ENV`
and `NEXT_PUBLIC_APP_RELEASE`.

Browser requests use `/api/cairn-v7q` with opaque endpoint aliases. The proxy
accepts only supported PostHog endpoints, fixes the upstream host, bounds request
bodies to 4 MB and responses to 8 MB, and strips app cookies, bearer credentials
and referrers. Body reads share the request's 15-second timeout. It forwards SDK
assets and configuration to the PostHog asset host. Keep the proxy outside future
authentication or locale redirects, and retain `skipTrailingSlashRedirect`.
An uncommon route avoids common blocklist patterns but cannot guarantee delivery
through every blocker.

Product events describe actions and outcomes, including authentication, project
creation, document publishing and reading, search, design changes, agent access,
teams and sharing. They omit document titles, HTML, summaries, search text,
email addresses and invitation or CLI tokens. Route properties use templates.
Autocapture, session replay, surveys and raw console capture are disabled for this
private workspace. Browser error capture and server error hooks retain safe
stack locations without copying error messages or request bodies.

Each backend operation emits a structured completion log with its outcome,
duration, request ID, trace ID and allowed domain identifiers. Effect supplies
SQL and service spans. Browser request spans, Next.js spans and Effect spans
share W3C trace context. Log attributes `posthogDistinctId` and `sessionId` use
the existing project's person and session links. Expected authorization failures,
revision conflicts and cancellations remain distinct from unexpected exceptions.

The application writes JSON logs to stdout and drains Effect logs to
`https://us.i.posthog.com/i/v1/logs`. Traces go to
`https://us.i.posthog.com/i/v1/traces`. Request finalizers and Next.js `after()`
flush bounded batches before serverless suspension. These are application drains;
they do not include Vercel's build logs or platform request logs. Vercel platform
Drains require Pro or Enterprise, so this setup stays on Hobby.

Optional `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` adds a second log sink.
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` selects an alternative trace collector.
Use full OTLP HTTP/JSON endpoint URLs. The matching `*_HEADERS` variables accept
comma-separated, URL-encoded `name=value` pairs. Credentials for independent
collectors belong only in server environment variables. PostHog's distributed
tracing API is in beta.

Set `POSTHOG_LOGS_ENABLED=false` to stop the direct PostHog server log drain or
`POSTHOG_TRACES_ENABLED=false` to stop server trace exports. An independent log
collector remains active when only the PostHog log drain is disabled.
`OTEL_SDK_DISABLED=true` disables all server OTLP exports. These switches preserve
stdout logs and do not disable browser analytics or browser logs and traces.

Source-map upload requires a server-only `POSTHOG_API_KEY` with error tracking
write access and `POSTHOG_PROJECT_ID=555830`. Builds upload source maps under the
`chronicon` release and remove them after upload. Set `NEXT_PUBLIC_APP_RELEASE` to a unique
build identifier when no Vercel commit SHA is available. A failed upload stops the
Turbopack build. Without that key the upload wrapper and
public browser source maps remain disabled. Never use a `NEXT_PUBLIC_` prefix for
the upload key. Deploy the same build that performed the upload.

To inspect a release manually, open an existing account, browse projects and
documents, search, and perform an intended write. Inspect browser requests under
the proxy path, then filter PostHog Activity by `app=chronicon`. Follow a
`request_id` into Logs and its `trace_id` into Traces. Check both a successful
operation and an ordinary rejected action. Verify source-map symbolication after
supplying the upload key. Follow the repository's no-automated-tests policy.

See the current [PostHog Next.js guide](https://posthog.com/docs/libraries/next-js),
[Logs guide](https://posthog.com/docs/logs/installation/nextjs),
[tracing guide](https://posthog.com/docs/distributed-tracing/installation/nextjs),
[source-map guide](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs),
[Effect logging guide](https://effect.website/docs/observability/logging/) and
[wide event guidance](https://loggingsucks.com/).

## Contribute

Read [AGENTS.md](AGENTS.md) for contributor conventions, development commands, and
verification policy. The project uses Next.js, React, Base UI, Effect, and Bun.

The design studio adapts [shadcn/ui](https://ui.shadcn.com). See
[third-party credits and licenses](THIRD_PARTY_NOTICES.md).
