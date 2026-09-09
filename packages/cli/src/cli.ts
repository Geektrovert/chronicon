#!/usr/bin/env node
import { Cause, Console, Effect, Schema } from "effect";
import { run } from "./commands.ts";
import { CliError } from "./errors.ts";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

const program = run(process.argv.slice(2)).pipe(
  Effect.catchCause((cause) => {
    if (Cause.hasInterruptsOnly(cause)) return Effect.failCause(cause);
    const error = Cause.squash(cause);
    return Console.error(
      Schema.is(CliError)(error)
        ? error.message
        : "Unable to complete the command. Check your connection and configuration.",
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    );
  }),
);
// The executable is the Promise boundary. Effects own resources and cancellation.
void Effect.runPromise(program, { signal: controller.signal }).catch(() => {
  if (!controller.signal.aborted)
    process.stderr.write(
      "Unable to complete the command. Check your connection and configuration.\n",
    );
  process.exitCode = controller.signal.aborted ? 130 : 1;
});
