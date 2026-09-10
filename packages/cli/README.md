# Chronicon CLI

Publish documents and manage project designs from your terminal.

The package is `@chronicon/cli` and the command is `chronicon`. npm and JSR releases
are not available yet. [Build from source](#build-from-source) to use it now.

## Connect your terminal

```sh
chronicon login
chronicon whoami
```

Login opens your default browser. Sign in, choose **Authorize CLI**, then return to
your terminal. Access expires after 30 days. Use `--no-browser` to open the printed
link yourself on the same computer.

Run `chronicon logout` to revoke this terminal's key and remove its saved login.
You can also revoke it from **Connect an agent** in the workspace sidebar.

## Choose a project

```sh
chronicon project create my-project --name "My project"
```

Creating a project makes it the default for the current Git repository. To use an
existing project:

```sh
chronicon project list
chronicon project link PROJECT_ID
```

Use `--relink` to replace a different default, or `--project ID` for one command.
Outside Git, pass `--project ID`. Linked worktrees share the default project.

## Publish and update documents

```sh
chronicon docs upsert plan --file plan.html --title "Implementation plan" \
  --kind plan --expected-revision 0
chronicon docs list --query "authentication"
chronicon docs read plan
```

Use revision `0` for a new document. For an update, read the document first and
pass its current revision:

```sh
chronicon docs upsert plan --file plan.html --title "Updated implementation plan" \
  --kind plan --expected-revision 1
```

Updates replace all HTML and metadata. Include the title, summary, type, and tags
you want to keep. If the revision changed, read the latest document and merge your
changes before publishing again.

HTML files can be up to 2 MB. Include assets in the file. For automatic light and
dark appearance, use CSS variables with light defaults, dark overrides inside
`@media (prefers-color-scheme: dark)`, and `:root { color-scheme: light dark }`.

## Read and update design guidance

```sh
chronicon design read > design.md
chronicon design read --json
chronicon design update --file design.md --expected-revision 1
```

Edit guidance outside the generated block. Get the current design revision with
`--json`; use `0` before the first save. Back up local edits before redirecting
another download into `design.md`, since `>` replaces the file.

To change theme settings, use `chronicon design update --input design-update.json`.
The JSON must include `expectedRevision` and `settings`, `guidance`, or `markdown`.
Include the complete settings object when changing settings. Omitted guidance or
settings are preserved; `guidance` and `markdown` are mutually exclusive.

## Other commands

| Command                                                      | Purpose                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `chronicon docs read --id ID --revision N`                   | Read a specific document revision                                              |
| `chronicon project update --name NAME --expected-revision N` | Rename the default project; add `--description TEXT` to update its description |
| `chronicon call TOOL --input FILE`                           | Run any MCP tool with JSON input                                               |
| `chronicon --help`                                           | Show commands and options                                                      |

Data commands print JSON. `design read` prints Markdown unless you pass `--json`.

## Servers and saved access

Use `--server https://YOUR_SITE` for another deployment, or set `CHRONICON_SERVER`.
Otherwise, the CLI uses the repository's saved server or `https://chronicon.klyk.work`.
HTTP is supported only for local development.

The project link lives at `chronicon/project.json` inside Git's common metadata
directory. Credentials live separately in `$XDG_CONFIG_HOME/chronicon` or
`~/.config/chronicon`, with one active account per server. They are never stored in
the repository link or printed by data commands.

<details>
<summary>Troubleshoot login and publishing</summary>

- If login times out, run `chronicon login` again. Browser authorization must return
  to the same computer; SSH sessions need a forwarded loopback port.
- If a login response is lost, start a fresh login. Revoke unused **Chronicon CLI**
  keys from **Connect an agent** in the workspace sidebar.
- If logout cannot reach the server, the saved login remains so you can retry.
- If publishing loses its connection, read the document before retrying. The save
  may have completed even when its response was lost.
- If a saved project is unavailable, check the account with `chronicon whoami`
  and choose an accessible project with `chronicon project list`.

</details>

## Build from source

From the repository root, with Bun installed:

```sh
bun install --frozen-lockfile
bun run --cwd packages/cli build
node packages/cli/dist/cli.js --help
```

Use `node packages/cli/dist/cli.js` in place of `chronicon` in the examples above.
Node.js 22+ is required. Repository lint, typecheck, and formatting include the CLI.

<details>
<summary>Registry installation after publication</summary>

```sh
npx @chronicon/cli login
pnpx @chronicon/cli --help
bunx @chronicon/cli --help
```

Use `bunx --bun @chronicon/cli` to select Bun explicitly. JSR runs the same source
through Deno:

```sh
deno run --allow-env --allow-read --allow-write --allow-net --allow-run jsr:@chronicon/cli/cli --help
```

The CLI needs access to files, Chronicon, the local login callback, Git, and your
browser. You can narrow Deno permissions to those servers, paths, and executables.

</details>

<details>
<summary>Publish the package</summary>

Deploy the backend and run its migrations first. Publishing requires access to the
`chronicon` scope on npm and JSR. Review both package previews before publishing:

```sh
cd packages/cli
npm pack --dry-run
npx jsr publish --dry-run
npm publish --access public
npx jsr publish
```

npm includes the compiled CLI, README, and license. JSR includes TypeScript source.

</details>
