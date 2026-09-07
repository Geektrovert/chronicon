import { Schema } from "effect";
import { librarySchema } from "./model";

export const searchRequest = Schema.Union([
  Schema.Struct({ type: Schema.Literal("index"), library: librarySchema }),
  Schema.Struct({
    type: Schema.Literal("search"),
    id: Schema.Int,
    query: Schema.String,
    projectId: Schema.optionalKey(Schema.String),
  }),
]);
export const searchResponse = Schema.Union([
  Schema.Struct({ type: Schema.Literal("ready") }),
  Schema.Struct({
    type: Schema.Literal("results"),
    id: Schema.Int,
    ids: Schema.Array(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
]);
