// The JSON downloads of a document, the citation of a regulation, and Print or save as PDF (the print dialog; doc-nav.css has the print layout). Copy and Download in Text, HTML and Markdown are the shell's: the .doc-actions
// container carries data-formats-for="article.content" and data-file-name, and the shell (marinContentFormats,
// marinFormatMenus) reads the page and passes it to marinCopyRich, marinCopyText and marinDownload. This adds the two
// formats only a guide has: the page's own structured data and the whole guide's.
(() => {
  "use strict";

  const actions = document.querySelector(".doc-actions[data-file-name]:not([data-section-id])");
  if (!actions) return;

  const status = actions.querySelector(".doc-action-status");
  const say = (message) => {
    if (status) status.textContent = message;
  };

  async function download(format) {
    if (format === "print") {
      window.print();
      return;
    }
    if (format === "json") {
      const script = document.querySelector('script[type="application/ld+json"]');
      if (!script) return say("No JSON is available for this page.");
      marinDownload({ content: script.textContent, name: `${actions.dataset.fileName}.json`, type: "application/ld+json" });
      return say("JSON file downloaded.");
    }
    if (format === "guide-json") {
      try {
        const response = await fetch(actions.dataset.guideJson);
        if (!response.ok) throw new Error("not found");
        marinDownload({ content: await response.text(), name: `${actions.dataset.guideName}-structured-data.json`, type: "application/ld+json" });
        return say("JSON file downloaded.");
      } catch {
        return say("Could not download the guide's data.");
      }
    }
  }

  // Copy citation: for a document that names its manual (data-citation-base), the citation of the section the address points at, or of the whole
  // document when it points at none. It holds only what the page already says: the manual, the document or section as it is headed, the effective
  // date when the data has one, the address, and the day it was copied.
  //   County of Marin, Personnel Management Regulations, PMR 24.3 Formal Grievance (effective 2005-01). https://…/pmr-24.html#24-3 (accessed 2026-11-24).
  // `sectionId` names the section (the Copy menu at the end of a section); without it, the section the address points at, if any.
  async function copyCitation(sectionId, statusLine) {
    const { citationBase: base, citationPrefix: prefix = "", citationEffective: effective } = actions.dataset;
    const id = sectionId || (location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : "");
    const target = id ? document.getElementById(id) : null;
    const heading = target && target.matches("h2") ? [...target.childNodes].filter((n) => !(n.nodeType === 1 && n.matches(".heading-anchor"))).map((n) => n.textContent).join("").trim() : "";
    const numbered = /^\d+(\.\d+)*\s/.test(heading); // "24.3 Formal Grievance" is a section; "Source" is not
    const what = numbered ? `${prefix} ${heading}`.trim() : (document.querySelector("article h1")?.textContent || document.title).trim();
    const accessed = new Date().toLocaleDateString("en-CA");
    const url = `${location.origin}${location.pathname}${numbered ? `#${id}` : ""}`;
    const text = `${base}, ${what}${effective ? ` (effective ${effective})` : ""}. ${url} (accessed ${accessed}).`;
    (statusLine || say)((await marinCopyText(text)) ? "Citation copied." : "Could not copy the citation.");
  }

  // Anywhere in the page: the Citation item of a Copy menu, and the section link button. The menu of a section (data-section-id on its .doc-actions) cites
  // and links that section; the page's own menu cites the section the address points at, or the whole document. Each says what happened in its own
  // status line (the shell does so for Text, HTML and Markdown), and a section's status clears itself.
  const statusOf = (box) => (message) => {
    const line = box.querySelector(".doc-action-status");
    if (line) line.textContent = message;
  };
  document.addEventListener("click", async (event) => {
    const box = event.target.closest(".doc-actions");
    if (!box) return;
    if (event.target.closest('[data-copy-format="citation"]')) copyCitation(box.dataset.sectionId || "", statusOf(box));
    const link = event.target.closest("[data-section-link]");
    if (link) statusOf(box)((await marinCopyText(`${location.origin}${location.pathname}#${box.dataset.sectionId}`)) ? "Link copied." : "Could not copy the link.");
  });
  // What a section's menu says clears after a few seconds, so the end of each section is not left with old messages.
  document.querySelectorAll(".doc-actions[data-section-id] .doc-action-status").forEach((line) => {
    let timer;
    new MutationObserver(() => {
      clearTimeout(timer);
      if (line.textContent) timer = setTimeout(() => { line.textContent = ""; }, 4000);
    }).observe(line, { childList: true, characterData: true, subtree: true });
  });

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-format]");
    if (button) download(button.dataset.downloadFormat);
  });
})();
