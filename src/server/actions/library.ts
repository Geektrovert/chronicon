import { PgClient } from "@effect/sql-pg";
import { Effect, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { documentSchema, projectSchema, type Principal } from "@/lib/model";
import { databaseError } from "../database";
import { AppError } from "../errors";

const listLibrary = Effect.fn("Library.list")(function* (principal: Principal, projectId?: string) {
  const sql = yield* PgClient.PgClient;
  const keyScope =
    principal.projectIds === null
      ? sql`TRUE`
      : principal.projectIds.length
        ? sql`p.id IN ${sql.in(principal.projectIds)}`
        : sql`FALSE`;
  const organizationScope =
    principal.access === "agent"
      ? sql`p."organizationId" = ${principal.organizationId}`
      : sql`TRUE`;
  const projectScope = projectId
    ? sql`p.id = ${projectId}`
    : sql`(p."organizationId" = ${principal.organizationId} OR pa.role IS NOT NULL)`;
  const documentScope = projectId ? sql`p.id = ${projectId}` : sql`TRUE`;
  const listProjects = SqlSchema.findAll({
    Request: Schema.Void,
    Result: projectSchema,
    execute: () => sql`
      SELECT p.*, CASE WHEN owner_member.id IS NOT NULL THEN 'full_access' ELSE pa.role END AS "accessRole"
      FROM project p
      LEFT JOIN member owner_member ON owner_member."organizationId" = p."organizationId" AND owner_member."userId" = p."ownerId" AND p."ownerId" = ${principal.ownerId}
      LEFT JOIN project_access pa ON pa."projectId" = p.id AND pa."userId" = ${principal.ownerId} AND ${principal.emailVerified}
      WHERE ${projectScope} AND ${keyScope} AND ${organizationScope}
        AND (owner_member.id IS NOT NULL OR pa.role IS NOT NULL)
      ORDER BY p.name`,
  });
  const projects = yield* listProjects(undefined).pipe(databaseError("list projects"));
  const projectIds = projects.map((project) => project.id);
  const selectedProjects = projectIds.length ? sql`p.id IN ${sql.in(projectIds)}` : sql`FALSE`;
  const listDocuments = SqlSchema.findAll({
    Request: Schema.Void,
    Result: documentSchema,
    execute: () => sql`
      SELECT d.*, EXISTS(SELECT 1 FROM document_star s WHERE s."documentId" = d.id AND s."userId" = ${principal.ownerId}) AS starred, CASE
        WHEN owner_member.id IS NOT NULL OR pa.role = 'full_access' OR da.role = 'full_access' THEN 'full_access'
        WHEN pa.role = 'edit' OR da.role = 'edit' THEN 'edit'
        ELSE 'view' END AS "accessRole"
      FROM document d JOIN project p ON p.id = d."projectId"
      LEFT JOIN member owner_member ON owner_member."organizationId" = p."organizationId" AND owner_member."userId" = p."ownerId" AND p."ownerId" = ${principal.ownerId}
      LEFT JOIN project_access pa ON pa."projectId" = p.id AND pa."userId" = ${principal.ownerId} AND ${principal.emailVerified}
      LEFT JOIN document_access da ON da."documentId" = d.id AND da."userId" = ${principal.ownerId} AND ${principal.emailVerified}
      WHERE ${keyScope} AND ${organizationScope} AND ${documentScope} AND ((${selectedProjects} AND (owner_member.id IS NOT NULL OR pa.role IS NOT NULL)) OR da.role IS NOT NULL)
      ORDER BY d."updatedAt" DESC`,
  });
  const documents = yield* listDocuments(undefined).pipe(databaseError("list documents"));
  return { projects, documents };
});

export const loadLibrary = (principal: Principal) => listLibrary(principal);

export const loadProjectLibrary = Effect.fn("Library.project")(function* (
  principal: Principal,
  projectId: string,
) {
  const library = yield* listLibrary(principal, projectId);
  if (!library.projects.length)
    return yield* new AppError({
      status: 404,
      message: "Project not found. Check the project and account.",
    });
  return library;
});
