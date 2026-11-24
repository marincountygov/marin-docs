// The app shell's header title links to "./", which is right on the home page only. On every page, point it at the app's
// root (body[data-app-root]) once the header has been drawn.
(() => {
  const root = document.body.dataset.appRoot;
  if (!root || root === "./") return;
  const fix = () => {
    const link = document.querySelector(".app-title__link");
    if (!link) return false;
    link.setAttribute("href", root);
    return true;
  };
  if (fix()) return;
  const watch = new MutationObserver(() => { if (fix()) watch.disconnect(); });
  watch.observe(document.body, { childList: true, subtree: true });
})();
