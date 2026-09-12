export const shortcutActions = [
  { id: "search", label: "Search workspace", binding: "Mod+k" },
  { id: "projectSearch", label: "Search current project", binding: "Mod+Shift+k" },
  { id: "document", label: "Publish document", binding: "n" },
  { id: "project", label: "Create project", binding: "p" },
  { id: "agents", label: "Connect an agent", binding: "a" },
  { id: "library", label: "All documents", binding: "1" },
  { id: "starred", label: "Starred documents", binding: "2" },
  { id: "archive", label: "Archive", binding: "3" },
  { id: "refresh", label: "Refresh library", binding: "r" },
  { id: "shortcuts", label: "Keyboard shortcuts", binding: "," },
  { id: "sidebar", label: "Toggle sidebar", binding: "Mod+b" },
] as const;

export type ShortcutAction = (typeof shortcutActions)[number]["id"];

export type Keybindings = Record<ShortcutAction, string>;

export const defaultBindings: Keybindings = {
  search: "Mod+k",
  projectSearch: "Mod+Shift+k",
  document: "n",
  project: "p",
  agents: "a",
  library: "1",
  starred: "2",
  archive: "3",
  refresh: "r",
  shortcuts: ",",
  sidebar: "Mod+b",
};

export function bindingFromEvent(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
) {
  const key = event.key.toLowerCase();

  if (!/^[a-z0-9,./;]$/.test(key) || event.altKey || (event.metaKey && event.ctrlKey)) return null;

  return `${event.metaKey || event.ctrlKey ? "Mod+" : ""}${event.shiftKey ? "Shift+" : ""}${key}`;
}

export function bindingError(bindings: Keybindings) {
  const seen = new Set<string>();

  for (const action of shortcutActions) {
    const binding = bindings[action.id];

    if (!binding) continue;

    if (!/^(Mod\+)?(Shift\+)?[a-z0-9,./;]$/.test(binding))
      return "Use a letter, number, comma, period, slash, or semicolon. You can add Ctrl/Cmd and Shift.";

    if (/^Mod\+(Shift\+)?[wtqnlrphf0-9]$/.test(binding))
      return "That combination is reserved for the browser. Choose another shortcut.";

    if (seen.has(binding))
      return "Two actions use the same shortcut. Change or disable one before saving.";
    seen.add(binding);
  }

  return null;
}

export const formatBinding = (binding: string) =>
  binding
    ? binding
        .replace("Mod+", "Ctrl/Cmd+")
        .toUpperCase()
        .replace("CTRL/CMD", "Ctrl/Cmd")
        .replace("SHIFT", "Shift")
    : "Disabled";
