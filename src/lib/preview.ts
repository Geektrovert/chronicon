import { Schema } from "effect";

export const previewNavigation = Schema.Struct({
  type: Schema.Literal("chronicon:preview:navigate"),
  href: Schema.String.check(Schema.isMaxLength(4096)),
});
const readRoutePattern =
  /^\/(?:documents\/[a-f0-9-]+|projects\/[a-z0-9]+(?:-[a-z0-9]+)*|starred|archive)?$/;

// Only app read routes may cross the sandbox bridge. Never pass an arbitrary
// document-supplied URL to Next's router (including API or javascript: URLs).
export function previewRoute(href: string, origin: string) {
  if (!URL.canParse(href, origin)) return undefined;
  const url = new URL(href, origin);
  if (url.origin !== origin || url.username || url.password || url.search) return undefined;
  if (!readRoutePattern.test(url.pathname)) return undefined;
  return url.pathname + url.hash;
}

// A srcdoc iframe has an opaque origin. Never add allow-same-origin here.
export function previewHTML(html: string) {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // Keep section links inside srcdoc. App links go through a validated parent
  // bridge; references open outside the frame with no opener or referrer.
  const navigation = `<script>
(() => {
const base = new URL(document.baseURI);
const readRoute = new RegExp(${JSON.stringify(readRoutePattern.source)});
const newTabs = new WeakMap();
function revealFragment(hash) {
  let id = hash.slice(1);
  if (!id) { window.scrollTo(0, 0); return; }
  try { id = decodeURIComponent(id); } catch {}
  const target = document.getElementById(id) || document.getElementsByName(id)[0];
  if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }); }
}
function prepareLink(event) {
  if (!(event.target instanceof Element)) return null;
  const link = event.target.closest("a[href], area[href]");
  if (!link) return null;
  if (!newTabs.has(link)) newTabs.set(link, link.getAttribute("target") === "_blank");
  const href = link.getAttribute("href").trim();
  if (href.startsWith("#") || href.startsWith("about:srcdoc#")) {
    link.setAttribute("target", "_self");
    return { hash: href.slice(href.indexOf("#")) };
  }
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  link.setAttribute("referrerpolicy", "no-referrer");
  return { url, newTab: newTabs.get(link) };
}
document.addEventListener("pointerdown", prepareLink, true);
document.addEventListener("contextmenu", prepareLink, true);
document.addEventListener("auxclick", prepareLink, true);
document.addEventListener("click", function(event) {
  if (event.defaultPrevented) return;
  const prepared = prepareLink(event);
  if (!prepared) return;
  if (prepared.hash !== undefined) {
    event.preventDefault();
    revealFragment(prepared.hash);
    return;
  }
  if (prepared.newTab || !event.isTrusted || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = prepared.url;
  if (url.origin !== base.origin || url.username || url.password || url.search) return;
  if (!readRoute.test(url.pathname)) return;
  event.preventDefault();
  parent.postMessage({ type: "chronicon:preview:navigate", href: url.href }, base.origin);
});
window.addEventListener("message", function(event) {
  if (event.source !== parent || event.origin !== base.origin) return;
  const data = event.data;
  if (!data || data.type !== "chronicon:preview:fragment" || typeof data.hash !== "string" || !data.hash.startsWith("#") || data.hash.length > 4096) return;
  revealFragment(data.hash);
});
})();
</script>`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${navigation}${html}`;
}
