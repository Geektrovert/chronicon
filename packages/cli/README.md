# Chronicon CLI

Create projects, publish HTML documents, and read or search your private Chronicon library.

```sh
npx @chronicon/cli login
pnpx @chronicon/cli project create my-project --name "My project"
bunx @chronicon/cli docs upsert plan --file plan.html --title "Implementation plan" --kind plan --expected-revision 0
```

These registry commands become available after the package is published. Node.js 22+
is required for the npm executable. `bunx --bun @chronicon/cli` explicitly selects Bun.

Login opens your default browser. Sign in or create an account, review the request,
and authorize your terminal. The CLI listens on an ephemeral IPv4 loopback port;
the browser returns a single-use code, which the CLI exchanges using S256 PKCE.
The resulting document key expires after 30 days and can be revoked in Settings.
The CLI never asks for your password. Use `--no-browser` to open the printed URL
yourself on the same computer. Remote SSH login needs a forwarded loopback port.

`chronicon logout` revokes the current CLI key before removing local credentials.
If revocation cannot reach the service, credentials remain so you can retry.
If a login response is lost, start a fresh login and revoke any unused
"Chronicon CLI" key in Settings. Key issuance is never automatically retried.

```sh
chronicon whoami
chronicon project list
chronicon project link PROJECT_ID
chronicon project link ANOTHER_ID --relink
chronicon project update --name "New name" --description "Purpose" --expected-revision 1
chronicon docs list --query "authentication"
chronicon docs read plan
chronicon docs read --id DOCUMENT_ID --revision 1
chronicon docs upsert plan --file plan.html --title "Implementation plan" --kind plan --expected-revision 1
chronicon call upsert_document --input document.json
```

Data commands print JSON. `call TOOL --input FILE` exposes every MCP capability,
including first-publication project creation. Document updates replace the full HTML
and metadata. Read first, keep metadata you need, and pass the current revision.
Use revision `0` only for new documents. Conflicts require reading and reconciling;
the CLI does not silently overwrite or retry a write.

Use CSS variables with light defaults, `@media (prefers-color-scheme: dark)`
overrides, and `:root { color-scheme: light dark }`. Previews follow the site's theme.

New projects automatically become the repository's default. The CLI stores the
version-1 association at `chronicon/project.json` inside `git rev-parse
--path-format=absolute --git-common-dir`. Linked worktrees share it. An existing,
different association requires explicit `--relink`. IDs that become inaccessible
never cause replacement projects to be created. Outside Git, use `--project ID`;
a successful remote creation still prints its result if local linking is unavailable.

Credentials live separately under `$XDG_CONFIG_HOME/chronicon`, or
`~/.config/chronicon`, in files keyed by server origin. Unix files use mode `0600`
and the directory uses `0700`; on Windows they inherit the user's directory ACLs.
One account is active per origin. Logging in again replaces that origin's credential
and attempts to revoke its previous CLI key. Tokens never go into repository metadata.

Server selection is `--server`, then `CHRONICON_SERVER`, then the saved repository
association, then `https://chronicon.klyk.work`. Alternate deployments need HTTPS.
HTTP is accepted only for local development. Credentials must match both server and
workspace before the saved project can be reused.

## JSR

The same source has a JSR entrypoint:

```sh
deno run --allow-env --allow-read --allow-write --allow-net --allow-run jsr:@chronicon/cli/cli --help
```

The CLI needs filesystem access for documents and local configuration, network
access for Chronicon and loopback, and subprocess access for Git and the default
browser. Narrow Deno permissions to your chosen server, directories and executables
when installing it for regular use. JSR does not generate an npm `bin`; npm supplies
the executable for npx, pnpx and bunx.

## Development and publication

From the repository root, run `bun install --frozen-lockfile`, then
`bun run --cwd packages/cli build`. Run `node packages/cli/dist/cli.js --help`.
The repository's lint, typecheck and formatting checks include the CLI source.

Publish only this package directory after the backend migration and deployment:

```sh
cd packages/cli
npm pack --dry-run
npx jsr publish --dry-run
npm publish --access public
npx jsr publish
```

Both registries require publishing access to the `chronicon` scope. Review the
package contents before publishing. The npm package includes compiled CLI code,
this README and the license; JSR includes the CLI TypeScript sources.
