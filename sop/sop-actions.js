(() => {
  function statusFor(button) {
    return button.closest(".doc-actions")?.querySelector(".doc-action-status") ?? null;
  }

  document.querySelectorAll('[data-action="download-json"]').forEach((button) => {
    button.addEventListener("click", () => {
      const status = statusFor(button);
      const script = document.querySelector('script[type="application/ld+json"]');
      if (!script) {
        if (status) status.textContent = "No JSON is available for this document";
        return;
      }
      const filename = document.title.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
      window.marinDownload({ content: script.textContent, name: filename, type: "application/ld+json" });
    });
  });
})();
