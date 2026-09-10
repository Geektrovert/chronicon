"use client";
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import {
  bindingFromEvent,
  defaultBindings,
  formatBinding,
  shortcutActions,
  type Keybindings,
  type ShortcutAction,
} from "@/lib/keybindings";
import { saveKeybindings } from "@/client/actions/keybindings";
import { useTask } from "@/client/runtime";
import { Button } from "./ui/button";
import { FieldError } from "./ui/field";
import { Form } from "./ui/form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

export function KeyboardSettings({
  bindings,
  onSaved,
  onClose,
}: {
  bindings: Keybindings;
  onSaved: (bindings: Keybindings) => void;
  onClose: () => void;
}) {
  const run = useTask();
  const [recording, setRecording] = useState<ShortcutAction>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function save(value: Keybindings) {
    if (busy) return;
    setBusy(true);
    setError("");
    run(saveKeybindings(value), {
      onSuccess: () => {
        onSaved(value);
        onClose();
      },
      onError: setError,
      onSettled: () => setBusy(false),
    });
  }
  const form = useForm({ defaultValues: bindings, onSubmit: ({ value }) => save(value) });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="wide">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Select a shortcut, then press the new keys. Escape cancels. Choose Save shortcuts to
            apply changes in this browser.
          </DialogDescription>
        </DialogHeader>
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          {shortcutActions.map((action) => (
            <form.Field key={action.id} name={action.id}>
              {(field) => (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{action.label}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Change ${action.label} shortcut`}
                      onClick={() => setRecording(action.id)}
                      onBlur={() => setRecording(undefined)}
                      onKeyDown={(event) => {
                        if (recording !== action.id || event.nativeEvent.isComposing) return;
                        if (event.key === "Tab") {
                          setRecording(undefined);
                          return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        if (event.key === "Escape") {
                          setRecording(undefined);
                          return;
                        }
                        const binding = bindingFromEvent(event);
                        if (binding) {
                          field.handleChange(binding);
                          setRecording(undefined);
                          setError("");
                        }
                      }}
                    >
                      {recording === action.id
                        ? "Press shortcut…"
                        : formatBinding(field.state.value)}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Disable ${action.label} shortcut`}
                      onClick={() => field.handleChange("")}
                    >
                      Disable
                    </Button>
                  </div>
                </div>
              )}
            </form.Field>
          ))}
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => save(defaultBindings)}
            >
              Reset to defaults
            </Button>
            <Button type="submit" disabled={busy || !!recording}>
              {busy ? "Saving…" : "Save shortcuts"}
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
