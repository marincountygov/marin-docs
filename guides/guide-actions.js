// The JSON downloads of a guide page. Copy and Download in Text, HTML and Markdown are the shell's: the .doc-actions
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

  actions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-download-format]");
    if (button) download(button.dataset.downloadFormat);
  });
})();
