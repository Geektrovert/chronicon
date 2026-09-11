import { Effect } from "effect";
import {
  acceptedInvitationSchema,
  invitationSchema,
  sharingSchema,
  sharingInput,
  resourceTypeSchema,
  type AccessRole,
} from "@/lib/sharing";
import { decodeClient } from "../errors";
import { request } from "./request";
import { announceTeamChange } from "./session";
import { observeAction } from "../observe-action";

export type ResourceType = typeof resourceTypeSchema.Type;
export const loadSharing = (type: ResourceType, id: string) =>
  request(sharingSchema, `/api/sharing?type=${type}&id=${encodeURIComponent(id)}`);

type SharingChange =
  | { action: "invite"; email: string; role: AccessRole }
  | { action: "visibility"; visibility: "private" | "public"; expectedRevision?: number }
  | { action: "remove"; userId: string }
  | { action: "cancel"; invitationId: string };

export const changeSharing = (type: ResourceType, id: string, change: SharingChange) =>
  decodeClient(sharingInput, { type, id, ...change }).pipe(
    Effect.flatMap((body) => request(sharingSchema, "/api/sharing", { method: "POST", body })),
    observeAction(`sharing_${change.action}`, {
      resource_type: type,
      visibility: change.action === "visibility" ? change.visibility : undefined,
      role: change.action === "invite" ? change.role : undefined,
    }),
  );

export const loadInvitation = (id: string, type: "team" | "resource") =>
  request(invitationSchema, `/api/invitations/${encodeURIComponent(id)}?type=${type}`);

export const acceptInvitation = (id: string, type: "team" | "resource") =>
  request(acceptedInvitationSchema, `/api/invitations/${encodeURIComponent(id)}`, {
    method: "POST",
    body: { type },
  }).pipe(
    observeAction("invitation_accept", { invitation_type: type }),
    Effect.tap(() => (type === "team" ? announceTeamChange : Effect.void)),
    Effect.tap(({ redirectUrl }) => Effect.sync(() => window.location.assign(redirectUrl))),
  );
