import { Context, Crypto, Effect, FileSystem, Layer, Option, Path, Redacted, Schema } from "effect";
import { put, get, del } from "@vercel/blob";
import { AppConfig } from "../config";
import { StorageError } from "../errors";

const pathSchema = Schema.String.check(Schema.isPattern(/^documents\/[a-f0-9-]+\.html$/));
const io = <A>(operation: string, work: (signal: AbortSignal) => Promise<A>) =>
  Effect.tryPromise({ try: work, catch: () => new StorageError({ operation }) });

export class Storage extends Context.Service<
  Storage,
  {
    readonly put: (html: string) => Effect.Effect<string, StorageError>;
    readonly read: (path: string) => Effect.Effect<Option.Option<string>, StorageError>;
    readonly remove: (path: string) => Effect.Effect<void, StorageError>;
  }
>()("chronicon/server/Storage") {
  static readonly layer = Layer.effect(
    Storage,
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const fs = yield* FileSystem.FileSystem;
      const paths = yield* Path.Path;
      const uuid = (yield* Crypto.Crypto).randomUUIDv4.pipe(
        Effect.mapError(() => new StorageError({ operation: "generate file identifier" })),
      );
      const token = Redacted.value(config.blobToken);
      const localPath = Effect.fn("Storage.localPath")(function* (path: string) {
        yield* Schema.decodeEffect(pathSchema)(path).pipe(
          Effect.mapError(() => new StorageError({ operation: "validate path" })),
        );
        if (config.production)
          return yield* new StorageError({ operation: "local storage disabled in production" });
        return paths.join(".chronicon", "blobs", path);
      });
      const store = Effect.fn("Storage.put")(function* (html: string) {
        const path = `documents/${yield* uuid}.html`;
        if (token)
          yield* io("upload", (abortSignal) =>
            put(path, html, {
              token,
              access: "private",
              addRandomSuffix: false,
              contentType: "text/html; charset=utf-8",
              abortSignal,
            }),
          );
        else {
          const file = yield* localPath(path);
          yield* fs
            .makeDirectory(paths.dirname(file), { recursive: true })
            .pipe(Effect.mapError(() => new StorageError({ operation: "create directory" })));
          yield* fs
            .writeFileString(file, html, { flag: "wx", mode: 0o600 })
            .pipe(Effect.mapError(() => new StorageError({ operation: "write" })));
        }
        return path;
      });
      const read = Effect.fn("Storage.read")(function* (path: string) {
        if (!token) {
          const file = yield* localPath(path);
          return yield* fs.readFileString(file).pipe(
            Effect.asSome,
            Effect.mapError(() => new StorageError({ operation: "read" })),
          );
        }
        const blob = yield* io("download", (abortSignal) =>
          get(path, { token, access: "private", abortSignal }),
        );
        if (!blob || blob.statusCode !== 200) return Option.none();
        return Option.some(yield* io("read response", () => new Response(blob.stream).text()));
      });
      const remove = Effect.fn("Storage.remove")(function* (path: string) {
        if (token) yield* io("delete", (abortSignal) => del(path, { token, abortSignal }));
        else {
          const file = yield* localPath(path);
          yield* fs
            .remove(file)
            .pipe(Effect.mapError(() => new StorageError({ operation: "delete" })));
        }
      });
      return Storage.of({ put: store, read, remove });
    }),
  );
}
