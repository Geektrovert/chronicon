import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Layer, Option, Path, Redacted, Schema } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import { get, put } from "@vercel/blob";
import { AppConfig } from "../src/server/config";
import { databaseLayer } from "../src/server/database";
import { configuredOwnerEmail } from "./lib/provision-owner";

class BlobUploadError extends Schema.TaggedError<BlobUploadError>()("BlobUploadError", {
  message: Schema.String,
}) {}

const io = <A>(message: string, work: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: () => new BlobUploadError({ message }) });

const main = Effect.gen(function* () {
  const config = yield* AppConfig;
  const token = Redacted.value(config.blobToken);
  if (config.production || process.argv.length !== 2)
    return yield* new BlobUploadError({
      message: "Run bun run storage:upload locally, without arguments.",
    });
  if (!token)
    return yield* new BlobUploadError({
      message: "Set BLOB_READ_WRITE_TOKEN for your private Blob store before uploading.",
    });

  const email = yield* configuredOwnerEmail;
  const sql = yield* SqlClient.SqlClient;
  const fs = yield* FileSystem.FileSystem;
  const paths = yield* Path.Path;
  const owner = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ id: Schema.String }),
    execute: (ownerEmail) => sql`SELECT id FROM "user" WHERE lower(email) = ${ownerEmail}`,
  })(email);
  if (Option.isNone(owner))
    return yield* new BlobUploadError({
      message: "No account matches OWNER_EMAIL. Check the configured database and owner email.",
    });
  const revisions = yield* SqlSchema.findAll({
    Request: Schema.String,
    Result: Schema.Struct({
      blobPath: Schema.String.check(Schema.isPattern(/^documents\/[a-f0-9-]+\.html$/)),
      bytes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2_000_000 })),
    }),
    execute: (ownerId) => sql`
      SELECT r."blobPath", r.bytes FROM revision r
      JOIN document d ON d.id = r."documentId"
      JOIN project p ON p.id = d."projectId"
      WHERE p."ownerId" = ${ownerId}
      ORDER BY r."createdAt", r.id`,
  })(owner.value.id);

  const readRemote = Effect.fn("BlobUpload.readRemote")(function* (path: string) {
    const blob = yield* io(`Could not read private blob ${path}.`, (abortSignal) =>
      get(path, { token, access: "private", useCache: false, abortSignal }),
    );
    if (!blob) return Option.none<string>();
    if (blob.statusCode !== 200)
      return yield* new BlobUploadError({ message: `Unexpected response for ${path}.` });
    return Option.some(
      yield* io(`Could not read the contents of ${path}.`, () => new Response(blob.stream).text()),
    );
  });

  yield* Console.log(`Checking ${revisions.length} stored revisions. Local files stay in place.`);
  const results = yield* Effect.forEach(revisions, ({ blobPath, bytes }) =>
    Effect.gen(function* () {
      const file = paths.join(".chronicon", "blobs", blobPath);
      const local = (yield* fs.exists(file))
        ? Option.some(yield* fs.readFileString(file))
        : Option.none<string>();
      const remote = yield* readRemote(blobPath);
      const content = Option.orElse(local, () => remote);
      if (Option.isNone(content))
        return yield* new BlobUploadError({
          message: `Missing ${blobPath} locally and in Blob. Restore the local file, then rerun.`,
        });
      if (new TextEncoder().encode(content.value).byteLength !== bytes)
        return yield* new BlobUploadError({
          message: `Size mismatch for ${blobPath}. No existing file was replaced.`,
        });
      if (Option.isSome(remote)) {
        if (remote.value !== content.value)
          return yield* new BlobUploadError({
            message: `Content mismatch for ${blobPath}. No existing file was replaced.`,
          });
        return "verified";
      }

      yield* io(`Upload failed for ${blobPath}. It is safe to rerun this command.`, (abortSignal) =>
        put(blobPath, content.value, {
          token,
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "text/html; charset=utf-8",
          abortSignal,
        }),
      );
      const uploaded = yield* readRemote(blobPath);
      if (Option.isNone(uploaded) || uploaded.value !== content.value)
        return yield* new BlobUploadError({
          message: `Could not verify ${blobPath}. Local files remain available; rerun to check.`,
        });
      return "uploaded";
    }),
  );
  yield* Console.log(
    `${results.filter((result) => result === "uploaded").length} uploaded; ${results.filter((result) => result === "verified").length} already present and verified. Database records and local files were unchanged.`,
  );
}).pipe(
  Effect.provide(
    Layer.mergeAll(databaseLayer.pipe(Layer.provideMerge(AppConfig.layer)), BunServices.layer),
  ),
  Effect.catch((error) =>
    Console.error(
      Schema.is(BlobUploadError)(error)
        ? error.message
        : "Upload stopped. Check your database, owner, Blob token, and local file permissions. Local files were kept; you can rerun this command.",
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
);

BunRuntime.runMain(main, { disableErrorReporting: true });
