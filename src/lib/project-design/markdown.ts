import type { designRecord } from "./model";
import { FONT_DEFINITIONS } from "./fonts";

const START = "<!-- chronicon:design:start -->";

const END = "<!-- chronicon:design:end -->";

type Record = typeof designRecord.Type;

function fontInstructions(design: Record) {
  const names = new Set([design.settings.font, design.settings.fontHeading]);
  const fonts = FONT_DEFINITIONS.filter((font) => names.has(font.name));

  return fonts.length
    ? "Load the selected font families before applying these tokens: " +
        fonts.map((font) => `${font.title} from ${font.dependency}`).join("; ") +
        ". Keep their font licenses when redistributing."
    : "These system fonts need no downloads.";
}

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

Base UI / ${design.settings.style}. Icons: ${design.settings.iconLibrary}.
Use semantic shadcn tokens for surfaces, text, controls, and charts.
Read this file on demand when doing design work.

Body font: ${design.settings.font}. Heading font: ${design.settings.fontHeading}.
${fontInstructions(design)}
Direction: ${design.settings.rtl ? "RTL. Set dir=rtl and use logical spacing properties." : "LTR."}
Interactive cursor: ${design.settings.pointer ? "pointer" : "default"}.
Menu color: ${design.settings.menuColor}. Menu accent: ${design.settings.menuAccent}.
Keep this generated block intact; change structured settings with update_project_design.
Edit the project guidance below this block freely. Send expectedRevision on every update.

## Settings

\`\`\`json
${JSON.stringify(design.settings, null, 2)}
\`\`\`

## Theme CSS

For an application, switch the .dark class with the app theme. Map these variables
to Tailwind utilities using shadcn's @theme inline convention. Derive radius-sm/md/lg/xl
as 0.75/0.875/1/1.2 times --radius; 2xl/3xl/4xl use 1.6/2.4/3.2.
Use --font-sans for body and component text and --font-heading for headings.
Use --menu-background/foreground/accent/accent-foreground for menus.
The selected shadcn style owns component spacing and shape. Install matching
Base UI components instead of applying only these colors to another style.

For a self-contained Chronicon HTML document, use the light variables on :root and
put the dark variables inside @media (prefers-color-scheme: dark) { :root { … } }.
Set :root { color-scheme: light dark }. The preview follows Chronicon's appearance.

\`\`\`css
${designCSS(design.tokens)}
\`\`\`

## Component templates and source

- [shadcn theme setup](https://ui.shadcn.com/docs/theming)
- [${design.settings.style} component styles](https://github.com/shadcn-ui/ui/blob/${design.sourceRevision}/apps/v4/registry/styles/style-${design.settings.style}.css)
- [Base UI preview templates](https://github.com/shadcn-ui/ui/tree/${design.sourceRevision}/apps/v4/registry/bases/base/blocks/preview-02)
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
