import { Effect, Schema } from "effect";
import type { cliAuthorization } from "@/lib/cli-auth";
import { request } from "./request";

export const authorizeCli = Effect.fn("Client.authorizeCli")(function* (
  input: typeof cliAuthorization.Type,
) {
  const result = yield* request(Schema.Struct({ redirect: Schema.String }), "/api/cli/authorize", {
    method: "POST",
    body: input,
  });
  window.location.assign(result.redirect);
});
