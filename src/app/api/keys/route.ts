import { Effect } from "effect";
import { keyInput, deleteKeyInput } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { listKeys, createKey, revokeKey } from "@/server/actions/keys";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      return yield* listKeys(yield* authenticate(request.headers), request.headers);
    }),
  );

export const POST = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);

      return yield* createKey(principal, yield* decodeInput(keyInput, yield* readJSON(request)));
    }),
  );

export const DELETE = (request: Request) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const { keyId } = yield* decodeInput(deleteKeyInput, yield* readJSON(request));

      return yield* revokeKey(principal, request.headers, keyId);
    }),
  );
