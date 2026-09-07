import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Config, Console, Effect, Layer, Redacted, Schema } from "effect";
import { Prompt } from "effect/unstable/cli";
import { databaseLayer } from "../src/server/database";
import { AppConfig } from "../src/server/config";
import {
  configuredOwnerEmail,
  OwnerSetupError,
  passwordSchema,
  provisionOwner,
  requireEmptyWorkspace,
} from "./lib/provision-owner";

const ownerLayer = databaseLayer.pipe(Layer.provideMerge(AppConfig.layer));
const hiddenPassword = (message: string) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const value = yield* restore(
        Prompt.hidden({
          message,
          validate: (value) =>
            Schema.decodeEffect(passwordSchema)(value).pipe(
              Effect.mapError(() => "Use between 12 and 128 characters."),
            ),
        }),
      );
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Redacted.wipeUnsafe(value);
        }),
      );
      return value;
    }),
  );
const main = Effect.gen(function* () {
  const nonInteractive = yield* Config.all({
    ci: Config.string("CI").pipe(Config.withDefault("")),
    vercel: Config.string("VERCEL").pipe(Config.withDefault("")),
  });
  if (nonInteractive.ci || nonInteractive.vercel || !process.stdin.isTTY || !process.stdout.isTTY)
    return yield* new OwnerSetupError({
      message: "Run bun run owner:create in your own interactive terminal.",
    });
  if (process.argv.length !== 2)
    return yield* new OwnerSetupError({
      message: "This command takes no arguments. Enter your password at the hidden prompt.",
    });
  const email = yield* configuredOwnerEmail;
  const config = yield* AppConfig;
  const target = yield* Effect.try({
    try: () => new URL(Redacted.value(config.databaseUrl)).hostname,
    catch: () => new OwnerSetupError({ message: "Check DATABASE_URL." }),
  });
  yield* Console.log(`Create owner: ${email}\nDatabase: ${target}`);
  yield* Console.log("Your password stays hidden. Only its salted hash is stored in the database.");
  yield* requireEmptyWorkspace;
  const password = yield* hiddenPassword("Password (12–128 characters):");
  const confirmation = yield* hiddenPassword("Confirm password:");
  if (Redacted.value(password) !== Redacted.value(confirmation))
    return yield* new OwnerSetupError({
      message: "Passwords did not match. No account was created. Run the command again.",
    });
  yield* provisionOwner(password);
  yield* Console.log("Owner account created. You can now sign in. Public signup remains disabled.");
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(ownerLayer, BunServices.layer)),
  Effect.catchTag("QuitError", () =>
    Console.error("Cancelled. No account was created.").pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 130;
        }),
      ),
    ),
  ),
  Effect.catch((error) =>
    Console.error(
      Schema.is(OwnerSetupError)(error)
        ? error.message
        : "Owner setup failed. Check your database configuration and run bun run db:migrate first.",
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);
BunRuntime.runMain(main, { disableErrorReporting: true });
