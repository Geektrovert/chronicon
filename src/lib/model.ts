import { Effect, Schema } from "effect";

export const slugSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(80),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
);
const text = (max: number) => Schema.Trim.check(Schema.isMaxLength(max));
const requiredText = (max: number) => text(max).check(Schema.isMinLength(1));
const defaultText = (max: number) =>
  text(max).pipe(Schema.withDecodingDefaultKey(Effect.succeed("")));
const documentKind = Schema.Literals(["report", "plan", "reference"]);
export const visibilitySchema = Schema.Literals(["private", "public"]);
export const documentSharingInput = Schema.Struct({
  visibility: visibilitySchema,
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export const documentSharingSchema = Schema.Struct({
  visibility: visibilitySchema,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  inheritedPublic: Schema.Boolean,
  publicUrl: Schema.NullOr(Schema.String),
});
export const accessRoleSchema = Schema.Literals(["full_access", "edit", "view"]);
export type AccessRole = typeof accessRoleSchema.Type;
export const projectInput = Schema.Struct({
  slug: slugSchema,
  name: requiredText(100),
  description: defaultText(400),
});
export const projectReference = Schema.Union([
  Schema.Struct({ id: Schema.NonEmptyString }),
  Schema.Struct({ slug: slugSchema }),
]);
const upsertProject = Schema.Union([Schema.Struct({ id: Schema.NonEmptyString }), projectInput]);
export const publishInput = Schema.Struct({
  project: upsertProject,
  slug: slugSchema,
  title: requiredText(160),
  summary: defaultText(500),
  kind: documentKind.pipe(Schema.withDecodingDefaultKey(Effect.succeed("report"))),
  tags: Schema.Array(requiredText(32))
    .check(Schema.isMaxLength(12))
    .pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  html: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_000_000)),
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sharing: Schema.optionalKey(documentSharingInput),
});
export const documentPatch = Schema.Struct({
  starred: Schema.optionalKey(Schema.Boolean),
  archived: Schema.optionalKey(Schema.Boolean),
  sharing: Schema.optionalKey(documentSharingInput),
}).check(
  Schema.makeFilter(
    (value) =>
      value.starred !== undefined || value.archived !== undefined || value.sharing !== undefined,
  ),
);
export const keyInput = Schema.Struct({
  name: requiredText(60),
  projectIds: Schema.NullOr(Schema.Array(Schema.String)),
  write: Schema.Boolean,
  share: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 365 })),
}).check(Schema.makeFilter((value) => !value.share || value.write));
export const deleteKeyInput = Schema.Struct({ keyId: Schema.NonEmptyString });
export const revisionNumber = Schema.Int.check(Schema.isGreaterThan(0));
export const projectSchema = Schema.Struct({
  id: Schema.String,
  ownerId: Schema.String,
  organizationId: Schema.String,
  visibility: visibilitySchema,
  accessRole: Schema.optionalKey(accessRoleSchema),
  slug: Schema.String,
  name: Schema.String,
  description: Schema.String,
  createdAt: Schema.String,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
});
export const projectUpdate = Schema.Struct({
  id: Schema.NonEmptyString,
  name: requiredText(100),
  description: Schema.optionalKey(text(400)),
  expectedRevision: Schema.Int.check(Schema.isGreaterThan(0)),
});
export const documentSchema = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  visibility: visibilitySchema,
  sharingRevision: Schema.Int.check(Schema.isGreaterThan(0)),
  accessRole: Schema.optionalKey(accessRoleSchema),
  slug: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  kind: documentKind,
  tags: Schema.Array(Schema.String),
  text: Schema.String,
  revision: revisionNumber,
  hash: Schema.String,
  starred: Schema.Boolean,
  archived: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export const revisionSchema = Schema.Struct({
  id: Schema.String,
  documentId: Schema.String,
  version: revisionNumber,
  blobPath: Schema.String,
  hash: Schema.String,
  bytes: Schema.Int,
  author: Schema.String,
  createdAt: Schema.String,
});
const revisionInfo = Schema.Struct({
  version: revisionNumber,
  bytes: Schema.Int,
  author: Schema.String,
  createdAt: Schema.String,
});
export const revisionHistorySchema = Schema.Struct({ id: Schema.String, ...revisionInfo.fields });
export const documentDetailSchema = Schema.Struct({
  document: documentSchema,
  sharing: documentSharingSchema,
  project: Schema.NullOr(projectSchema),
  revision: revisionInfo,
  history: Schema.Array(revisionHistorySchema),
  html: Schema.String,
});
export const libraryQuery = Schema.Struct({ projectId: Schema.optionalKey(Schema.NonEmptyString) });
export const librarySchema = Schema.Struct({
  projects: Schema.Array(projectSchema),
  documents: Schema.Array(documentSchema),
});
export const publishResultSchema = Schema.Struct({
  document: documentSchema,
  sharing: documentSharingSchema,
  created: Schema.Boolean,
  unchanged: Schema.Boolean,
  url: Schema.String,
});
export const documentUpdateResultSchema = Schema.Struct({
  ...documentSchema.fields,
  sharing: documentSharingSchema,
});
export type PublishInput = typeof publishInput.Type;
export type Project = typeof projectSchema.Type;
export type Document = typeof documentSchema.Type;
export type Library = typeof librarySchema.Type;
export type DocumentDetail = typeof documentDetailSchema.Type;
export type Principal = {
  readonly ownerId: string;
  readonly organizationId: string;
  readonly emailVerified: boolean;
  readonly name: string;
  readonly access: "owner" | "agent";
  readonly keyId?: string;
  readonly email?: string;
  readonly projectIds: ReadonlyArray<string> | null;
  readonly canWrite: boolean;
  readonly canShare: boolean;
};

export function repositoryAssociation(server: string, workspaceId: string, project: Project) {
  return { version: 1, server, workspaceId, projectId: project.id, projectSlug: project.slug };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}
