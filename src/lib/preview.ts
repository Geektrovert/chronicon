// A srcdoc iframe has an opaque origin. Never add allow-same-origin here.
export function previewHTML(html: string) {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // srcdoc inherits the app's base URL. Handle local fragments inside the sandbox
  // without allowing a <base> override or weakening the inherited app CSP.
  const fragments = `<script>
document.addEventListener("click", function(event) {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented) return;
  event.preventDefault();
  const hash = link.getAttribute("href").slice(1);
  if (!hash) { window.scrollTo(0, 0); return; }
  let id = hash;
  try { id = decodeURIComponent(hash); } catch {}
  const target = document.getElementById(id) || document.getElementsByName(id)[0];
  if (target) { target.scrollIntoView(); target.focus({ preventScroll: true }); }
});
</script>`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">${fragments}${html}`;
}
