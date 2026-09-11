import { Effect } from "effect";
import { documentPatch, revisionNumber } from "@/lib/model";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readDocument, updateDocument } from "@/server/actions/documents";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request, ctx: RouteContext<"/api/documents/[id]">) =>
  route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const { id } = yield* Effect.promise(() => ctx.params);
      const value = new URL(request.url).searchParams.get("revision");

      const revision =
        value === null ? undefined : yield* decodeInput(revisionNumber, Number(value));

      return yield* readDocument(principal, id, revision);
    }),
  );

export const PATCH = (request: Request, ctx: RouteContext<"/api/documents/[id]">) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const { id } = yield* Effect.promise(() => ctx.params);
      const patch = yield* decodeInput(documentPatch, yield* readJSON(request));

      return yield* updateDocument(principal, id, patch);
    }),
  );
