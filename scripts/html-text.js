// Plain text out of the HTML of our own pages, for the search files and the navigation of the procedures. Written without chained search-and-replace on
// markup, which can leave a tag behind (`<<script>script>` becomes `<script>` after one pass) or decode a character twice (`&amp;lt;` becomes `<`).
//
//   decodeEntities(text)          the character references our pages use, in one pass, so `&amp;lt;` becomes `&lt;` and no more
//   stripTags(html, gap = " ", skip)  the text of `html`: tags and comments dropped (each leaves `gap`), the text of script and style elements dropped;
//                                 an element for which skip(name, startTag) is true is dropped with what is inside it (a heading's "#" anchor link)
//   removeElements(html, names)   `html` without the named elements and what is inside them (script, style)
"use strict";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", "#039": "'", nbsp: " " };

function decodeEntities(text) {
  return String(text).replace(/&(amp|lt|gt|quot|apos|#0?39|nbsp);/g, (_, name) => ENTITIES[name]);
}

// Where the tag that starts at `start` (a "<") ends: the next ">" that is not inside a quoted attribute value. -1 when it never ends.
function tagEnd(html, start) {
  let quote = "";
  for (let i = start + 1; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

const nameAt = (html, start) => {
  const m = /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start, start + 40));
  return m ? m[1].toLowerCase() : "";
};

// The end of the element named `name` whose start tag begins at `start`: just after its closing tag, or the end of the text when it never closes.
function elementEnd(html, start, name) {
  const lower = html.toLowerCase();
  const close = lower.indexOf(`</${name}`, start);
  if (close === -1) return html.length;
  const end = tagEnd(html, close);
  return end === -1 ? html.length : end + 1;
}

function walk(html, { dropElements, gap, skip }) {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      out += gap;
      continue;
    }
    const name = nameAt(html, lt);
    if (!name) { // a "<" that does not start a tag is text
      out += "<";
      i = lt + 1;
      continue;
    }
    const end = tagEnd(html, lt);
    if (end === -1) break; // a tag that never ends: nothing after it is text
    if (html[lt + 1] !== "/" && (dropElements.has(name) || (skip && skip(name, html.slice(lt, end + 1))))) {
      i = elementEnd(html, lt, name);
      out += gap;
      continue;
    }
    out += gap;
    i = end + 1;
  }
  return out;
}

const stripTags = (html, gap = " ", skip) => walk(String(html), { dropElements: new Set(["script", "style"]), gap, skip });

// The HTML with the named elements removed but everything else kept as markup (for a page we then read by structure). Removing an element can join
// what was around it into a new one (`<scr<script></script>ipt>`), so it goes on until a pass removes nothing.
function removeElements(html, names) {
  const drop = new Set(names);
  const once = (source) => {
    let out = "";
    let i = 0;
    while (i < source.length) {
      const lt = source.indexOf("<", i);
      if (lt === -1) { out += source.slice(i); break; }
      const name = nameAt(source, lt);
      if (name && drop.has(name) && source[lt + 1] !== "/") {
        out += source.slice(i, lt);
        i = elementEnd(source, lt, name);
      } else {
        out += source.slice(i, lt + 1);
        i = lt + 1;
      }
    }
    return out;
  };
  let current = String(html);
  for (;;) {
    const next = once(current);
    if (next === current) return current;
    current = next;
  }
}

module.exports = { decodeEntities, stripTags, removeElements };
