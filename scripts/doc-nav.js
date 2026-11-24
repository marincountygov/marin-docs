// The document set outline: the left navigation of every kind of document in Marin Docs (guide pages, PMRs, SOPs).
// One function, so the three kinds cannot drift apart. The standard is written in marin-ui/docs/components.md ("Document set outline").
//
//   renderDocNav({ label, set, groups, collapse })
//     label     the accessible name of the navigation ("Guide outline", "Personnel Management Regulations")
//     set       { name, href } the set's title, linking to its list page (left out when the first group already links to the set's start)
//     groups    [{ name, items: [{ label, href, current }] }]; a group with no name is a plain list
//     search    { src, script }: adds a search box under the set title. src is the set's search file (see build-search-index.js),
//               script is the path to doc-search.js. The box is hidden until the script runs, so the page works without it.
//     collapse  true: each group is a <details> and only the group that holds the current document is open (a long set);
//               false: every group is open, headed by its name
//
// Plain HTML, no script: the details elements work without JavaScript. Exactly one item should be current; it is marked aria-current="page".
"use strict";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderDocNav({ label, set, groups, collapse = false, search }) {
  const list = (g) => `<ul>${g.items.map((i) => `<li><a href="${esc(i.href)}"${i.current ? ' aria-current="page"' : ""}>${esc(i.label)}</a></li>`).join("")}</ul>`;
  const body = groups.map((g) => {
    if (!g.name) return `<div>${list(g)}</div>`;
    if (!collapse) return `<div><h2>${esc(g.name)}</h2>${list(g)}</div>`;
    return `<details${g.items.some((i) => i.current) ? " open" : ""}><summary>${esc(g.name)}</summary>${list(g)}</details>`;
  }).join("");
  const title = set ? `<p class="doc-nav__set"><a href="${esc(set.href)}">${esc(set.name)}</a></p>` : "";
  const box = search
    ? `<search class="doc-nav__search" data-doc-search data-search-src="${esc(search.src)}" aria-label="Search ${esc(set ? set.name : label)}" hidden><div class="search-input-field"><label for="doc-nav-search">Search</label><input type="search" id="doc-nav-search" autocomplete="off"></div><p class="doc-nav__status app-help-text" role="status" aria-live="polite"></p><div class="doc-nav__results"></div></search><script src="${esc(search.script)}" defer></script>`
    : "";
  return `<aside class="doc-nav" aria-label="${esc(label)}">${title}${box}${body}</aside>`;
}

module.exports = { renderDocNav };
