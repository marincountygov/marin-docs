// The MarinOS shell around every page of Marin Docs below the home page (guides, PMRs, SOPs): the shell header (the app's name and
// its About and Updates), the page's content as the default tab, the About, Security and Updates sections, the shell footer and the
// feedback button. It is what Marin Budget does on its inner pages, and what the Marin Docs home page has. There is no breadcrumb.
//
//   shellBody(depth, contentHtml)   the markup from the skip link to the feedback button, for a page `depth` folders below the root
//   toShell(html, file)             turns a page that has the older docs header and footer (site-header, site-footer) into one with
//                                   the shell; a page that already has the shell is returned as it is
//
// The generators (build-guide.js, build-pmrs.js) call these when they write a page; scripts/apply-shell.js converts the pages written by hand.
"use strict";

const ICON = '<svg viewBox="0 0 24 24"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
const ABOUT = "Marin Docs holds County of Marin standard operating procedures, guides and Personnel Management Regulations.";
const BODY_OPEN = /<body[^>]*>/;

const rootOf = (depth) => (depth ? "../".repeat(depth) : "./");
const depthOf = (file) => file.split("/").length - 1;

const header = () => `<marin-app-header app-name="Marin Docs" app-description="County of Marin procedures and guides."><template data-icon>${ICON}</template></marin-app-header>`;
const info = (root) => `<marin-app-info app-name="Marin Docs" repo="marin-docs" security-src="${root}security.json" security-contact-url="${root}.well-known/security.txt"><template data-about><p>${ABOUT}</p></template></marin-app-info>`;
const footer = () => '<marin-app-footer app-name="Marin Docs"></marin-app-footer><marin-app-feedback></marin-app-feedback>';

function shellBody(depth, content, mainClass = "page") {
  const root = rootOf(depth);
  return `<a class="skip-link" href="#main">Skip to main content</a><marin-os-banner></marin-os-banner>${header()}` +
    `<main id="main" class="${mainClass}" tabindex="-1"><div id="app-status-message" class="visually-hidden" role="status" aria-live="polite"></div><div id="start" data-tab-section="start">${content}</div>${info(root)}</main>${footer()}`;
}

// The attributes the body needs, and the script that points the title link at the app's root (the shell's title link is "./", right on the home page only).
const bodyAttrs = (depth) => ` data-app-id="marin-docs" data-app-root="${rootOf(depth)}"`;
const homeScript = (depth) => `<script src="${rootOf(depth)}app-home.js" defer></script><script src="${rootOf(depth)}doc-highlight.js" defer></script>`;

function toShell(html, file) {
  if (html.includes("<marin-app-header")) return html;
  const depth = depthOf(file);
  const root = rootOf(depth);
  const open = html.match(/<main id="main" class="page" tabindex="-1">/);
  const close = html.lastIndexOf("</main>");
  if (!open || close < 0) throw new Error(`${file}: no <main id="main" class="page"> to put the shell around`);
  let out = html.replace(BODY_OPEN, (m) => m.replace(/>$/, `${bodyAttrs(depth)}>`));
  out = out.replace(/<header class="site-header">[\s\S]*?<\/header>/, () => header());
  const start = out.indexOf(open[0]);
  const end = out.lastIndexOf("</main>");
  out = out.slice(0, start + open[0].length) +
    `<div id="app-status-message" class="visually-hidden" role="status" aria-live="polite"></div><div id="start" data-tab-section="start">` +
    out.slice(start + open[0].length, end) + `</div>${info(root)}` + out.slice(end);
  out = out.replace(/<footer class="site-footer"[\s\S]*?<\/footer><a class="app-feedback"[^>]*>Feedback<\/a>/, () => footer());
  if (!out.includes("<marin-app-footer")) throw new Error(`${file}: the older footer was not found`);
  return out.replace("</body>", () => `${homeScript(depth)}</body>`);
}

module.exports = { shellBody, toShell, bodyAttrs, homeScript, depthOf };
