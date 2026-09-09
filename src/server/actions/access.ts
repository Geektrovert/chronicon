import { Effect, Option, Schema } from "effect";
import { Auth, authCall } from "../auth";
import { AppConfig } from "../config";
import { findOwnerEmail } from "./owner";
import { AppError, deny } from "../errors";
import type { Principal, Project } from "@/lib/model";

const keyMetadata = Schema.Struct({
  projectIds: Schema.NullOr(Schema.Array(Schema.String)).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
});
const keyPermissions = Schema.Record(Schema.String, Schema.Array(Schema.String));
export const authenticate = Effect.fn("Access.authenticate")(function* (headers: Headers) {
  const auth = yield* Auth;
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = headers.get("x-api-key") || bearer;
  if (key) {
    const result = yield* authCall(() =>
      auth.api.verifyApiKey({ body: { key, permissions: { documents: ["read"] } } }),
    );
    if (result.error?.code === "RATE_LIMITED")
      return yield* new AppError({
        status: 429,
        message: "This agent has reached its request limit. Wait a minute and try again.",
      });
    if (!result.valid || !result.key)
      return yield* new AppError({
        status: 401,
        message: "This agent key is invalid or expired. Create a new key in Settings.",
      });
    const owner = yield* findOwnerEmail(result.key.referenceId);
    if (Option.isNone(owner)) return yield* deny("This key's account no longer exists.");
    const metadata = yield* Schema.decodeUnknownEffect(keyMetadata)(result.key.metadata).pipe(
      Effect.mapError(
        () =>
          new AppError({
            status: 403,
            message: "This key has no project access. Create a scoped key in Settings.",
          }),
      ),
    );
    const permissions = yield* Schema.decodeUnknownEffect(keyPermissions)(
      result.key.permissions,
    ).pipe(Effect.orElseSucceed((): typeof keyPermissions.Type => ({})));
    return {
      ownerId: result.key.referenceId,
      name: result.key.name || "Agent",
      access: "agent",
      keyId: result.key.id,
      projectIds: metadata.projectIds,
      canWrite: !!permissions.documents?.includes("write"),
    } satisfies Principal;
  }
  const session = yield* authCall(() => auth.api.getSession({ headers }));
  if (!session)
    return yield* new AppError({ status: 401, message: "Sign in to open this workspace." });
  return {
    ownerId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    access: "owner",
    projectIds: null,
    canWrite: true,
  } satisfies Principal;
});
export const projectAccess = Effect.fn("Access.project")(function* (
  principal: Principal,
  project: Project | undefined,
  write = false,
) {
  if (!project || project.ownerId !== principal.ownerId)
    return yield* new AppError({ status: 404, message: "This project could not be found." });
  if (principal.projectIds && !principal.projectIds.includes(project.id))
    return yield* deny("This agent key cannot access this project.");
  if (write && !principal.canWrite) return yield* deny("This agent key has read-only access.");
  return project;
});
export const ownerAccess = Effect.fn("Access.owner")(function* (principal: Principal) {
  if (principal.access !== "owner")
    return yield* deny("Open Settings while signed in to manage this workspace.");
});
export const sameOrigin = Effect.fn("Access.sameOrigin")(function* (request: Request) {
  if (request.headers.has("authorization") || request.headers.has("x-api-key")) return;
  const { origin } = yield* AppConfig;
  if (request.headers.get("origin") !== origin)
    return yield* deny("Reload this page and try again.");
});
