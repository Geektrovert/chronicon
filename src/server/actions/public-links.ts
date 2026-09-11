import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Schema } from "effect";
import { SqlSchema } from "effect/unstable/sql";
import { publicDocumentAddressSchema } from "@/lib/model";
import { publicDocumentPath } from "@/lib/public-links";
import { databaseError } from "../database";
import { AppError } from "../errors";

// Call after authorizing the document. An address alone does not grant public access.
export const documentPublicPath = Effect.fn("Public.documentPath")(function* (id: string) {
  const sql = yield* PgClient.PgClient;
  const address = yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: publicDocumentAddressSchema,
    execute: (id) => sql`SELECT p.username, l.slug, l.identifier FROM public_document_link l
      JOIN "user" p ON p.id = l."ownerId" WHERE l."documentId" = ${id}`,
  })(id).pipe(databaseError("read document link"));
  if (Option.isNone(address))
    return yield* new AppError({
      status: 500,
      message: "This document's public link is unavailable.",
    });
  return publicDocumentPath(address.value);
});
