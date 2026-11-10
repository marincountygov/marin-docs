// The page shell shared by the generated Budget pages (build-budget.js and build-budget-2025.js).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ICON = '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>';
const FAVICON = "<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round' transform='translate(9,9) scale(1.25)'%3E" + ICON.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'") + "%3C/g%3E%3C/svg%3E\">";

const { testBanner } = require('./test-banner');
const TEST_BANNER = testBanner('budget/');

function shell(title, description, crumbs, body, up = '') {
  const trail = crumbs.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(' <span aria-hidden="true">/</span> ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Marin Docs</title>${FAVICON}<meta name="description" content="${esc(description)}"><link rel="stylesheet" href="styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a><marin-os-banner></marin-os-banner><header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON}</svg></span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${trail}</nav></div></header>${TEST_BANNER}<main id="main" class="page" tabindex="-1">${body.replace(/(<p class="org-dash__more"><a [^>]*>)/g, '$1All ')}</main><footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer><a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a><script src="${up}../vendor/marinos/marinos.js" defer></script></body></html>\n`;
}

module.exports = { ICON, FAVICON, shell, esc };
