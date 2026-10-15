// Phones keep the site open for days, so a fix released in the meantime never loads.
// When the page comes back into view, check whether a newer build is live and reload into it
// (the sleep being tracked is saved, so nothing is lost; a form being typed into is left alone).
const scriptOf = (html) => html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1] ?? null;

export function watchForUpdates() {
  const current = scriptOf(document.documentElement.innerHTML);
  if (!current) return;
  let last = 0;
  const check = async () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 60000) return;
    last = Date.now();
    try {
      const html = await fetch('./index.html', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
      const latest = scriptOf(html);
      const typing = document.activeElement?.matches?.('input, textarea, select');
      if (latest && latest !== current && !typing) window.location.reload();
    } catch { /* offline: try again next time */ }
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
}
