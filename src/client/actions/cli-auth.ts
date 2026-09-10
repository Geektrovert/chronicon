import { Effect, Schema } from "effect";
import type { cliAuthorization } from "@/lib/cli-auth";
import { request } from "./request";
import { observeAction } from "../observe-action";

export const authorizeCli = Effect.fn("Client.authorizeCli")(function* (
  input: typeof cliAuthorization.Type,
) {
  const result = yield* request(Schema.Struct({ redirect: Schema.String }), "/api/cli/authorize", {
    method: "POST",
    body: input,
  }).pipe(observeAction("cli_authorize"));
  window.location.assign(result.redirect);
});
