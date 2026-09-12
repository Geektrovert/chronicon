# Chronicon

A workspace for the documents you and your AI agents create.

Keep project plans, reports, and references in one searchable place. Read them in
your browser, revisit earlier revisions, and choose who can see them.

[Open Chronicon](https://chronicon.klyk.work) · [Get started](#get-started) · [CLI guide](packages/cli/README.md)

## Keep your project work together

- Publish HTML documents from your browser, terminal, or AI agent.
- Find documents by their content, project, or tags. Star favorites and archive finished work.
- Update a document at the same link, with earlier revisions available to read or download.
- Share a project with collaborators, or share just one document.
- Save a project's colors, fonts, and design guidance for your agents to reuse.

## Get started

1. [Create an account](https://chronicon.klyk.work/sign-up) with your email and password.
2. Choose **Create project** to group related documents.
3. Choose **Publish document**. Upload an HTML file or paste its source, then preview and publish it.

To make changes later, open the document and choose **Edit document**. Publishing
saves a new revision without changing its link.

Documents are HTML files up to 2 MB. Include styles, scripts, and images in the
file, since previews block external resources. You can ask your agent to prepare
the file for you.

## Choose who can read or edit

New projects are private. Use **Share project** or a document's **Share** button
to give people access.

| Permission  | What someone can do            |
| ----------- | ------------------------------ |
| Can view    | Read documents                 |
| Can edit    | Read and edit content          |
| Full access | Read, edit, and manage sharing |

Documents inherit their project's access. Sharing one document does not open the
rest of its private project. Removing someone's direct document access does not
remove access they have through the project.

Choose **Anyone with the link** to share a read-only public page. Public projects
include all their unarchived documents. To make a document private again, check
both its own sharing setting and its project's setting.

Anyone can forward a public link. To require sign-in, keep link access private
and add people by email.

<details>
<summary>Teams, invitations, and account settings</summary>

Your account starts with a team. Invite members in
[Team settings](https://chronicon.klyk.work/settings/team), and switch teams from
the sidebar. Joining a team does not automatically grant access to its projects.
Share projects with members separately.

Verify your email before sharing with others or accepting invitations. Invitations
expire after seven days. Ask the sender for a new one if yours expires.

Choose a username for your public links in
[Account settings](https://chronicon.klyk.work/settings/account). Old links
redirect when you change it.

Password reset is not available yet. Keep your password somewhere you can retrieve it.

</details>

## Work with AI agents

Choose **Connect an agent** in the sidebar. Select its projects, access level, and
expiration, then create a key. Copy the MCP configuration into your agent's
settings before closing the dialog. The key is shown only once.

- **Read** lets an agent find and read documents and project designs.
- **Write** also lets it publish and edit content, update design guidance, and
  change a document's public-link access when your permissions allow it.

You can revoke a key from the same dialog. For terminal use, the
[CLI guide](packages/cli/README.md) covers login, project linking, and publishing.
The CLI currently requires a local build.

### Give agents a shared design guide

Open a project's **Design system** to choose colors, fonts, icons, and component
styles with live previews. Add project notes under **Design guidance**, choose
**Save design**, and download `design.md` for your agents.

Saving a design does not change documents you have already published.

## Run locally

<details>
<summary>Set up a local workspace</summary>

Requires Bun 1.4.2+, Node.js 24+, OpenSSL, and Postgres on macOS or Linux.

```sh
bun install --frozen-lockfile
cp .env.example .env.local
```

In `.env.local`, set `DATABASE_URL` and a random `BETTER_AUTH_SECRET` of at least
32 characters. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to send verification
and invitation emails through a verified sender. Leave `BLOB_READ_WRITE_TOKEN`
empty to store files locally.

```sh
bun run db:migrate
bun run dev
```

Open the URL printed in your terminal, normally `https://chronicon.localhost`.
On first launch, Portless may ask to use port 443 and trust its local certificate.
Run the command in your terminal without `sudo`.

See [.env.example](.env.example) for optional configuration and
[AGENTS.md](AGENTS.md) for development commands and verification requirements.

</details>

<details>
<summary>Host your own workspace</summary>

Deploy to Vercel with Postgres and a private Vercel Blob store. Set the database,
authentication, and email variables above, plus `BLOB_READ_WRITE_TOKEN` and
`BETTER_AUTH_URL` with your site's HTTPS origin. Local file storage is unavailable
in production. Keep secrets in environment configuration and use separate preview
credentials.

Run `bun run db:migrate` against the intended database before deploying. When
upgrading an older installation to teams, pause writes until the migration and
app deployment both finish.

</details>

The design studio adapts shadcn/ui. See [third-party credits and licenses](THIRD_PARTY_NOTICES.md).
