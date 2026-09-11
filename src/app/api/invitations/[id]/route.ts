import { Effect } from "effect";
import { invitationInput, invitationTypeSchema } from "@/lib/sharing";
import { authenticate, sameOrigin } from "@/server/actions/access";
import { readInvitation, acceptInvitation } from "@/server/actions/invitations";
import { decodeInput } from "@/server/errors";
import { readJSON, route } from "@/server/http";

export const GET = (request: Request, ctx: RouteContext<"/api/invitations/[id]">) =>
  route(
    request,
    Effect.gen(function* () {
      const principal = yield* authenticate(request.headers);
      const { id } = yield* Effect.promise(() => ctx.params);

      return yield* readInvitation(
        principal,
        id,
        yield* decodeInput(invitationTypeSchema, new URL(request.url).searchParams.get("type")),
      );
    }),
  );

export const POST = (request: Request, ctx: RouteContext<"/api/invitations/[id]">) =>
  route(
    request,
    Effect.gen(function* () {
      yield* sameOrigin(request);
      const principal = yield* authenticate(request.headers);
      const { id } = yield* Effect.promise(() => ctx.params);
      const input = yield* decodeInput(invitationInput, yield* readJSON(request));

      return yield* acceptInvitation(principal, request.headers, id, input.type);
    }).pipe(Effect.uninterruptible),
  );
