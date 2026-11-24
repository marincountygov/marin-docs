// Highlights the words a person searched for on the page a search result opens.
// A search box (Marin Docs home, a set's list page, the left navigation, the MarinOS home page) writes the words to sessionStorage
// ("marin-search-hit": { path, terms, at }) when a result is pressed; nothing is added to the address. This page reads them, once, if they are
// for this page and less than two minutes old, wraps each word that starts with a term in <mark class="search-hit"> and scrolls to the first one
// (or stays at the section the address names, when that section has one). Escape clears the marks. Reloading shows none.
(() => {
  "use strict";
  const KEY = "marin-search-hit";
  let hit = null;
  try {
    hit = JSON.parse(sessionStorage.getItem(KEY) || "null");
    sessionStorage.removeItem(KEY);
  } catch { return; }
  if (!hit || hit.path !== location.pathname || !Array.isArray(hit.terms) || !hit.terms.length || Date.now() - hit.at > 120000) return;

  const plain = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const starts = (word) => hit.terms.some((t) => plain(word).startsWith(t));
  const WORD = /[\p{L}\p{N}]+/gu;

  const run = () => {
    const root = document.getElementById("start") || document.getElementById("main");
    if (!root) return;
    const skip = "script, style, nav, aside, .doc-actions, .doc-pager, mark, [data-no-copy], search, template";
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(skip) && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const marks = [];
    for (const node of nodes) {
      const text = node.nodeValue;
      const found = [...text.matchAll(WORD)].filter((m) => starts(m[0]));
      if (!found.length) continue;
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const m of found) {
        frag.append(text.slice(at, m.index));
        const mark = Object.assign(document.createElement("mark"), { className: "search-hit", textContent: m[0] });
        marks.push(mark);
        frag.append(mark);
        at = m.index + m[0].length;
      }
      frag.append(text.slice(at));
      node.replaceWith(frag);
    }
    if (!marks.length) return;
    const target = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    const first = (target && marks.find((m) => target.contains(m))) || marks[0];
    first.scrollIntoView({ block: "center" });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      marks.forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
      root.normalize();
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
