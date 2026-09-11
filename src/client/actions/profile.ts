import { Effect } from "effect";
import { publicProfileInput, publicProfileSchema } from "@/lib/model";
import { decodeClient } from "../errors";
import { request } from "./request";

export const savePublicProfile = (input: typeof publicProfileInput.Type) =>
  decodeClient(publicProfileInput, input).pipe(
    Effect.flatMap((body) =>
      request(publicProfileSchema, "/api/account/profile", { method: "PATCH", body }),
    ),
  );
