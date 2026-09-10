# Chronicon

A private workspace for project plans, reports, and design systems.

Keep the documents you and your agents create in one searchable place. Update them
without losing earlier revisions, and give each project a shared design language.

[Open Chronicon](https://chronicon.klyk.work) · [CLI guide](packages/cli/README.md) · [Run locally](#run-locally)

## What you can do

- **Publish documents** from your browser, terminal, or AI agent.
- **Find what you need** with full-text search, projects, tags, stars, and an archive.
- **Keep every revision** at one private link. View or download earlier versions.
- **Design by project** with live component previews, light and dark themes, and a reusable `design.md`.

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

Each account has its own private workspace. Document links require access to that
account; copying a link does not grant access to someone else. Agent keys can be
limited to selected projects and read-only access.

Choose Light, Dark, or System in [Appearance settings](https://chronicon.klyk.work/settings/appearance).
Appearance and keyboard shortcuts are saved in your browser.

Email verification and password reset are not available yet. Keep your password
somewhere you can retrieve it.

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

| Environment variable    | Value                                            |
| ----------------------- | ------------------------------------------------ |
| `DATABASE_URL`          | Postgres connection URL                          |
| `BLOB_READ_WRITE_TOKEN` | Token for your private Blob store                |
| `BETTER_AUTH_URL`       | Your site's HTTPS origin                         |
| `BETTER_AUTH_SECRET`    | A stable random secret of at least 32 characters |

Run `bun run db:migrate` against the target database before deploying. Local file
storage is unavailable in production. Keep secrets in environment configuration
and use separate credentials for preview deployments.

</details>

## Contribute

Read [AGENTS.md](AGENTS.md) for contributor conventions, development commands, and
verification policy. The project uses Next.js, React, Base UI, Effect, and Bun.

The design studio adapts [shadcn/ui](https://ui.shadcn.com). See
[third-party credits and licenses](THIRD_PARTY_NOTICES.md).
