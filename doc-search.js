// Search inside one set of documents (a guide, the PMR manual, the SOP collection): the box in the left navigation and the box on a set's list page.
// A box is <search data-doc-search data-search-src="search.json" [data-hide="#selector"]>. The search file (scripts/build-search-index.js) is read the
// first time the box is focused; it is large, so nothing is loaded for a person who does not search.
// Plain on purpose: lower case, accents ignored, every word typed must start a word of a name, the document it is in, or its text. Without
// JavaScript the box stays hidden and the page is as it was.
(() => {
  "use strict";
  const plain = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = (t) => window.marinSearchWords(t);
  const SHOWN = 40;
  // Where the words are, and the words marked on the page a result opens, come from the shell (marinSearchSnippet, marinSearchRemember),
  // which is loaded after this script on some pages: they are called when someone searches, never while this file loads.
  // A snippet is shown on a set's list page; the left navigation is too narrow for it and lists names only.

  document.querySelectorAll("search[data-doc-search]").forEach((box) => {
    const input = box.querySelector("input[type=search]");
    const status = box.querySelector(".doc-nav__status");
    const results = box.querySelector(".doc-nav__results");
    if (!input || !status || !results) return;
    const nav = box.closest(".doc-nav");
    // What the results replace: the groups of the navigation, or the part of the page named by data-hide.
    const covered = () => (box.dataset.hide ? [...document.querySelectorAll(box.dataset.hide)] : [...nav.children].filter((el) => el !== box && !el.classList.contains("doc-nav__set") && el.tagName !== "SCRIPT"));
    const src = new URL(box.dataset.searchSrc, document.baseURI).href;
    box.hidden = false;

    let entries = null;
    let loading = null;
    const load = () => {
      if (!loading) {
        loading = fetch(src).then((r) => (r.ok ? r.json() : [])).catch(() => []).then((list) => {
          entries = list.map((e) => ({ ...e, name: plain(e.n), nw: words(e.n), pw: words(e.p), tw: words(e.t) }));
        });
      }
      return loading;
    };

    const starts = (list, word) => list.some((w) => w.startsWith(word));
    const score = (e, typed, q) => {
      let total = 0;
      for (const word of typed) {
        if (starts(e.nw, word)) total += 3;
        else if (starts(e.pw, word)) total += 2;
        else if (starts(e.tw, word)) total += 1;
        else return 0;
      }
      if (e.name === q) total += 100;
      else if (e.name.startsWith(q)) total += 20;
      else if (e.name.includes(q)) total += 10; // a section number typed alone (24.3) finds the section
      return total;
    };

    const line = (count, q) => {
      const root = document.createElement("span");
      root.className = "results-line";
      root.append(Object.assign(document.createElement("span"), { className: "results-line__count", textContent: `${count.toLocaleString("en-US")} ${count === 1 ? "result" : "results"}` }));
      root.append(Object.assign(document.createElement("span"), { className: "results-line__slash", textContent: " / " }), Object.assign(document.createElement("span"), { className: "results-line__filters", textContent: `matching “${q}”` }));
      return root;
    };
    let typedNow = [];
    const item = (e) => {
      const li = document.createElement("li");
      li.append(Object.assign(document.createElement("a"), { href: new URL(e.h, src).href, textContent: e.n }));
      if (e.p) li.append(Object.assign(document.createElement("span"), { className: "doc-nav__in", textContent: e.p }));
      if (box.dataset.hide && e.t) li.append(window.marinSearchSnippet(e.t, typedNow) || Object.assign(document.createElement("span"), { className: "search-snippet", textContent: e.t.length > 170 ? `${e.t.slice(0, 169).trimEnd()}…` : e.t }));
      return li;
    };
    const clear = () => { results.replaceChildren(); status.replaceChildren(); covered().forEach((el) => { el.hidden = false; }); };
    const run = () => {
      const q = plain(input.value).trim().replace(/\s+/g, " ");
      const typed = words(q);
      if (!typed.length) { clear(); return; }
      load().then(() => {
        if (plain(input.value).trim().replace(/\s+/g, " ") !== q) return; // the box has changed since
        const found = entries.map((e, i) => [e, score(e, typed, q), i]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([e]) => e);
        typedNow = typed;
        covered().forEach((el) => { el.hidden = true; });
        status.replaceChildren(line(found.length, input.value.trim()));
        const ul = document.createElement("ul");
        ul.append(...found.slice(0, SHOWN).map(item));
        results.replaceChildren(...(found.length ? [ul] : []));
      });
    };

    input.addEventListener("focus", load);
    input.addEventListener("input", run);
    const links = () => [...results.querySelectorAll("a")];
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { const first = links()[0]; if (first) { event.preventDefault(); first.click(); } }
      else if (event.key === "ArrowDown") { const first = links()[0]; if (first) { event.preventDefault(); first.focus(); } }
      else if (event.key === "Escape") { input.value = ""; clear(); }
    });
    results.addEventListener("click", (event) => { const link = event.target.closest("a[href]"); if (link) window.marinSearchRemember(link.href, typedNow); });
    results.addEventListener("keydown", (event) => {
      const all = links();
      const at = all.indexOf(document.activeElement);
      if (at < 0) return;
      if (event.key === "ArrowDown" && at < all.length - 1) { event.preventDefault(); all[at + 1].focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); (at ? all[at - 1] : input).focus(); }
      else if (event.key === "Escape") { input.focus(); }
    });
  });
})();
