import { Schema } from "effect";

// Check the raw spelling too: URL normalizes alternate loopback IP spellings.
const callback = Schema.String.check(
  Schema.isPattern(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}\/callback$/),
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) return false;
    const port = Number(new URL(value).port);
    return port >= 1024 && port <= 65535;
  }),
);
const randomValue = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));
export const cliAuthorization = Schema.Struct({
  redirectUri: callback,
  state: randomValue,
  challenge: randomValue,
});
export const cliExchange = Schema.Struct({
  redirectUri: callback,
  code: randomValue,
  verifier: randomValue,
});

export function signInDestination(next: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  const url = new URL(next, "https://chronicon.invalid");
  if (url.origin !== "https://chronicon.invalid") return "/";
  if (url.pathname === "/cli/authorize") return url.pathname + url.search;
  return /^\/(?:$|starred\/?$|archive\/?$|settings(?:\/appearance)?\/?$|projects\/[^/]+(?:\/design)?\/?$|documents\/[^/]+\/?$)/.test(
    url.pathname,
  )
    ? url.pathname + url.hash
    : "/";
}
