import { Crypto, Effect, Encoding, Schema } from "effect";

export const hashJson = Effect.fn("Hash.json")(function* (value: Schema.Json) {
  const crypto = yield* Crypto.Crypto;
  const json = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value);

  return Encoding.encodeHex(yield* crypto.digest("SHA-256", new TextEncoder().encode(json)));
});
