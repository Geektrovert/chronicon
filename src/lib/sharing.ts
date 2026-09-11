import { Schema } from "effect";
import { accessRoleSchema, visibilitySchema } from "./model";

export { accessRoleSchema, visibilitySchema };
export type { AccessRole } from "./model";

export const resourceTypeSchema = Schema.Literals(["project", "document"]);
const email = Schema.Trim.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
);
const resource = { type: resourceTypeSchema, id: Schema.NonEmptyString };
export const sharingReference = Schema.Struct(resource);
export const sharingInput = Schema.Union([
  Schema.Struct({ ...resource, action: Schema.Literal("invite"), email, role: accessRoleSchema }),
  Schema.Struct({
    type: Schema.Literal("project"),
    id: Schema.NonEmptyString,
    action: Schema.Literal("visibility"),
    visibility: visibilitySchema,
  }),
  Schema.Struct({
    type: Schema.Literal("document"),
    id: Schema.NonEmptyString,
    action: Schema.Literal("visibility"),
    visibility: visibilitySchema,
    expectedRevision: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThan(0))),
  }),
  Schema.Struct({ ...resource, action: Schema.Literal("remove"), userId: Schema.NonEmptyString }),
  Schema.Struct({
    ...resource,
    action: Schema.Literal("cancel"),
    invitationId: Schema.NonEmptyString,
  }),
]);
export const sharingMemberSchema = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: accessRoleSchema,
  inherited: Schema.Boolean,
  canRemove: Schema.Boolean,
});
export const sharingSchema = Schema.Struct({
  visibility: visibilitySchema,
  revision: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  inheritedPublic: Schema.Boolean,
  canManage: Schema.Boolean,
  role: accessRoleSchema,
  publicUrl: Schema.String,
  members: Schema.Array(sharingMemberSchema),
  invitations: Schema.Array(
    Schema.Struct({ id: Schema.String, email: Schema.String, role: accessRoleSchema }),
  ),
});
export const teamInput = Schema.Union([
  Schema.Struct({ action: Schema.Literal("switch"), organizationId: Schema.NonEmptyString }),
  Schema.Struct({
    action: Schema.Literal("invite"),
    email,
    role: Schema.Literals(["member", "admin"]),
  }),
  Schema.Struct({ action: Schema.Literal("remove"), memberId: Schema.NonEmptyString }),
  Schema.Struct({ action: Schema.Literal("cancel"), invitationId: Schema.NonEmptyString }),
]);
export const teamsSchema = Schema.Struct({
  teams: Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.String, role: Schema.String }),
  ),
  activeTeamId: Schema.String,
  userId: Schema.String,
  emailVerified: Schema.Boolean,
  canManage: Schema.Boolean,
  members: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      userId: Schema.String,
      name: Schema.String,
      email: Schema.String,
      role: Schema.String,
    }),
  ),
  invitations: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      email: Schema.String,
      role: Schema.String,
      status: Schema.String,
    }),
  ),
});
export const invitationTypeSchema = Schema.Literals(["team", "resource"]);
export const invitationInput = Schema.Struct({ type: invitationTypeSchema });
export const invitationSchema = Schema.Struct({
  type: invitationTypeSchema,
  resourceName: Schema.String,
  inviterName: Schema.String,
  email: Schema.String,
  status: Schema.String,
  expiresAt: Schema.String,
  requiresEmailVerification: Schema.Boolean,
});
export const acceptedInvitationSchema = Schema.Struct({ redirectUrl: Schema.String });
export type Sharing = typeof sharingSchema.Type;
export type Teams = typeof teamsSchema.Type;
export type Invitation = typeof invitationSchema.Type;
