// The JSON downloads of a document, the citation of a regulation, and Print or save as PDF (the print dialog; doc-nav.css has the print layout). Copy and Download in Text, HTML and Markdown are the shell's: the .doc-actions
// container carries data-formats-for="article.content" and data-file-name, and the shell (marinContentFormats,
// marinFormatMenus) reads the page and passes it to marinCopyRich, marinCopyText and marinDownload. This adds the two
// formats only a guide has: the page's own structured data and the whole guide's.
(() => {
  "use strict";

  const actions = document.querySelector(".doc-actions[data-file-name]");
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
  // `sectionId` names the section (the buttons at the end of a section); without it, the section the address points at, if any.
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

  // Copy text of one section, as the page's own Copy > Text does (rich text, so it pastes formatted into Word or an email, and plain elsewhere).
  async function copySectionText(sectionId, statusLine) {
    const section = document.getElementById(sectionId)?.closest("section");
    if (!section) return statusLine("Could not find the section.");
    const formats = marinContentFormats(section);
    statusLine((await marinCopyRich(formats.text, formats.html)) ? "Text copied." : "Could not copy the text.");
  }

  // The buttons at the end of each section (data-section-copy). Their own status line says what happened and clears itself.
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-section-copy]");
    if (!button) return;
    const line = button.closest(".section-actions")?.querySelector(".section-actions__status");
    const statusLine = (message) => {
      if (!line) return;
      line.textContent = message;
      clearTimeout(line.clearAfter);
      line.clearAfter = setTimeout(() => { line.textContent = ""; }, 4000);
    };
    if (button.dataset.sectionCopy === "citation") copyCitation(button.dataset.sectionId, statusLine);
    else if (button.dataset.sectionCopy === "text") copySectionText(button.dataset.sectionId, statusLine);
  });

  actions.addEventListener("click", (event) => {
    if (event.target.closest('[data-copy-format="citation"]')) copyCitation();
    const button = event.target.closest("[data-download-format]");
    if (button) download(button.dataset.downloadFormat);
  });
})();
