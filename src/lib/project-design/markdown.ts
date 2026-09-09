import type { designRecord } from "./model";

const START = "<!-- chronicon:design:start -->";
const END = "<!-- chronicon:design:end -->";
type Record = typeof designRecord.Type;

function declarations(tokens: Readonly<{ [name: string]: string }>) {
  return Object.entries(tokens)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");
}
export function designCSS(tokens: Record["tokens"]) {
  return `:root {\n  color-scheme: light;\n${declarations(tokens.light)}\n}\n\n.dark {\n  color-scheme: dark;\n${declarations(tokens.dark)}\n}`;
}
export function managedMarkdown(design: Record) {
  return `${START}
# Project design system

Project ID: ${design.projectId} · Design revision: ${design.revision}

Base UI / Nova. Use semantic shadcn tokens for surfaces, text, controls, and charts.
System fonts need no downloads. Read this file on demand when doing design work.
Keep this generated block intact; change structured settings with update_project_design.
Edit the project guidance below this block freely. Send expectedRevision on every update.

## Settings

\`\`\`json
${JSON.stringify(design.settings, null, 2)}
\`\`\`

## Theme CSS

For an application, switch the .dark class with the app theme. Map these variables
to Tailwind utilities using shadcn's @theme inline convention. Derive radius-sm/md/lg/xl
as 0.6/0.8/1/1.4 times --radius. Use --font-sans for body and component text.

For a self-contained Chronicon HTML document, use the light variables on :root and
put the dark variables inside @media (prefers-color-scheme: dark) { :root { … } }.
Set :root { color-scheme: light dark }. The preview follows Chronicon's appearance.

\`\`\`css
${designCSS(design.tokens)}
\`\`\`

## Component templates and source

- [shadcn theme setup](https://ui.shadcn.com/docs/theming)
- [Nova / Base UI preview templates](https://github.com/shadcn-ui/ui/tree/${design.sourceRevision}/apps/v4/registry/bases/base/blocks/preview-02)
- [shadcn/ui source, MIT](https://github.com/shadcn-ui/ui/tree/${design.sourceRevision}) · Copyright (c) 2023 shadcn

Settings and resolved light/dark tokens are saved together. An upstream update does
not change an existing saved design. Existing published documents keep their own CSS.
${END}`;
}
export function designMarkdown(design: Record) {
  return `${managedMarkdown(design)}\n\n${design.guidance}\n`;
}

// Full design.md round trips preserve the generated contract. Plain Markdown is
// also accepted as guidance; partial or edited generated blocks are rejected.
export function guidanceFromMarkdown(markdown: string, current: Record) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized.includes(START) && !normalized.includes(END)) return normalized;
  const managed = managedMarkdown(current);
  if (!normalized.startsWith(managed)) return undefined;
  const guidance = normalized.slice(managed.length).trim();
  return guidance.includes(START) || guidance.includes(END) ? undefined : guidance;
}
