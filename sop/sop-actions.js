(() => {
  function statusFor(button) {
    return button.closest(".doc-actions")?.querySelector(".doc-action-status") ?? null;
  }

  document.querySelectorAll('[data-action="share"]').forEach((button) => {
    button.addEventListener("click", async () => {
      const status = statusFor(button);
      try {
        await navigator.clipboard.writeText(window.location.href);
        if (status) status.textContent = "Link copied";
      } catch {
        if (status) status.textContent = "Couldn't copy — copy the address bar link instead";
      }
    });
  });

  document.querySelectorAll('[data-action="download-json"]').forEach((button) => {
    button.addEventListener("click", () => {
      const status = statusFor(button);
      const script = document.querySelector('script[type="application/ld+json"]');
      if (!script) {
        if (status) status.textContent = "No JSON is available for this document";
        return;
      }
      const blob = new Blob([script.textContent], { type: "application/ld+json" });
      const url = URL.createObjectURL(blob);
      const filename = document.title.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".json";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  });
})();
