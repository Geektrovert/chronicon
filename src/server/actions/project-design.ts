import { PgClient } from "@effect/sql-pg";
import { DateTime, Effect, Option, Schema, Struct } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import type { Principal } from "@/lib/model";
import { buildTokens, SOURCE_REVISION } from "@/lib/project-design/config";
import { designMarkdown, guidanceFromMarkdown } from "@/lib/project-design/markdown";
import {
  defaultSettings,
  designRecord,
  type readDesignInput,
  type updateDesignInput,
} from "@/lib/project-design/model";
import { databaseError } from "../database";
import { AppError } from "../errors";
import { findProject } from "./projects";

const readRecord = Effect.fn("Design.readRecord")(function* (projectId: string) {
  const sql = yield* PgClient.PgClient;
  const found = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: designRecord,
    execute: (id) => sql`SELECT * FROM project_design WHERE "projectId" = ${id}`,
  })(projectId).pipe(databaseError("read project design"));
  return Option.getOrElse(found, (): typeof designRecord.Type => ({
    projectId,
    revision: 0,
    settings: defaultSettings,
    tokens: buildTokens(defaultSettings),
    guidance:
      "## Project guidance\n\nUse semantic tokens and support both light and dark appearances.\nKeep interactions keyboard accessible and respect reduced motion preferences.",
    sourceRevision: SOURCE_REVISION,
    updatedAt: null,
  }));
});
const detail = (record: typeof designRecord.Type) => ({
  ...record,
  markdown: designMarkdown(record),
});
const conflict = () =>
  new AppError({
    status: 409,
    message:
      "This design changed. Read the latest revision and reconcile your changes before saving.",
  });

export const readProjectDesign = Effect.fn("Design.read")(function* (
  principal: Principal,
  input: typeof readDesignInput.Type,
) {
  const project = yield* findProject(principal, input.project);
  return detail(yield* readRecord(project.id));
});

export const updateProjectDesign = Effect.fn("Design.update")(function* (
  principal: Principal,
  input: typeof updateDesignInput.Type,
) {
  const project = yield* findProject(principal, input.project, true);
  const current = yield* readRecord(project.id);
  if (current.revision !== input.expectedRevision) return yield* conflict();
  const guidance =
    input.markdown === undefined
      ? (input.guidance ?? current.guidance)
      : guidanceFromMarkdown(input.markdown, current);
  if (guidance === undefined)
    return yield* new AppError({
      status: 400,
      message:
        "Keep the generated design.md block intact. Edit guidance outside it, and use the settings field to change the theme.",
    });
  if (guidance.length > 64_000 || guidance.includes("<!-- chronicon:design:"))
    return yield* new AppError({
      status: 400,
      message:
        "Keep project guidance under 64,000 characters and outside generated design markers.",
    });
  const settings = input.settings ?? current.settings;
  const changedSettings = Struct.keys(settings).some(
    (key) => current.settings[key] !== settings[key],
  );
  // Preserve resolved tokens on notes-only writes, including after catalog upgrades.
  const record = {
    projectId: project.id,
    revision: current.revision + 1,
    settings,
    tokens: changedSettings || current.revision === 0 ? buildTokens(settings) : current.tokens,
    guidance,
    sourceRevision:
      changedSettings || current.revision === 0 ? SOURCE_REVISION : current.sourceRevision,
    updatedAt: DateTime.formatIso(yield* DateTime.now),
  };
  const sql = yield* PgClient.PgClient;
  const saved = yield* SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: designRecord,
    execute: () =>
      current.revision === 0
        ? sql`INSERT INTO project_design ("projectId", revision, settings, tokens, guidance, "sourceRevision", "updatedAt")
          VALUES (${record.projectId}, ${record.revision}, ${sql.json(record.settings)}, ${sql.json(record.tokens)}, ${record.guidance}, ${record.sourceRevision}, ${record.updatedAt})
          ON CONFLICT ("projectId") DO NOTHING RETURNING *`
        : sql`UPDATE project_design SET revision = ${record.revision}, settings = ${sql.json(record.settings)}, tokens = ${sql.json(record.tokens)},
          guidance = ${record.guidance}, "sourceRevision" = ${record.sourceRevision}, "updatedAt" = ${record.updatedAt}
          WHERE "projectId" = ${project.id} AND revision = ${input.expectedRevision} RETURNING *`,
  })(undefined).pipe(databaseError("save project design"));
  if (Option.isNone(saved)) return yield* conflict();
  return detail(saved.value);
}, Effect.uninterruptible);
