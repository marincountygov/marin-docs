#!/usr/bin/env node
// brand/index.html is generated from brand/brand-center.json — it does not
// edit itself. Run this after every edit to brand-center.json, or the page
// keeps showing stale data. No dependencies, matches this repo's
// no-build-step design (same pattern as scripts/embed-data.js in
// marin-expense: a plain Node script bakes JSON into static HTML, run
// on demand, never as part of a deploy pipeline).
//
//   node scripts/build-brand-center.js

const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..");
const dataPath = path.join(repoRoot, "brand", "brand-center.json");
const outPath = path.join(repoRoot, "brand", "index.html");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Overview ---------------------------------------------------------

const overviewSection = `
        <section class="section" id="overview">
          <h2>Purpose</h2>
          <p>${esc(data.purpose.summary)}</p>
          <ul>
            ${data.purpose.goals.map((g) => `<li>${esc(g)}</li>`).join("\n            ")}
          </ul>
        </section>`;

// --- Background ---------------------------------------------------------

const symbol = data.identity.symbol;
const backgroundSection = `
        <section class="section" id="background">
          <h2>Background &amp; significance</h2>
          <p>${esc(symbol.description)}</p>
          <p>The symbol represents:</p>
          <ul>
            ${symbol.meaning.map((m) => `<li>${esc(m)}</li>`).join("\n            ")}
          </ul>
        </section>`;

// --- Logos ---------------------------------------------------------

function logoCardMeta(fields) {
  return `
              <div class="logo-card__meta">
                ${fields
                  .filter((f) => f.value)
                  .map((f) => `<div class="logo-card__field"><span class="logo-card__label">${esc(f.label)}</span><span class="logo-card__value">${f.value}</span></div>`)
                  .join("\n                ")}
              </div>`;
}

function logoCard(variant) {
  const filename = variant.preview ? variant.preview.split("/").pop() : "";
  const reversed = /reversed/.test(variant.id);
  const fileLink = `<a href="${esc(variant.preview)}">${esc(filename)}</a>`;
  return `
            <article class="logo-card">
              <div class="logo-card__preview${reversed ? " logo-card__preview--reversed" : ""}">
                <img src="${esc(variant.preview)}" alt="${esc(variant.name)} preview" loading="lazy">
              </div>
              <h3>${esc(variant.name)}${variant.preferred ? ' <span class="app-badge">Preferred</span>' : ""}</h3>
              ${variant.description ? `<p>${esc(variant.description)}</p>` : ""}
              ${variant.usage ? `<p>${esc(variant.usage)}</p>` : ""}${logoCardMeta([
    { label: "Minimum width", value: variant.minimumWidthInches ? `${esc(variant.minimumWidthInches)}"` : "" },
    { label: "Download", value: fileLink },
  ])}
            </article>`;
}

const graphicMark = data.logos.graphicMark;
const logosSection = `
        <section class="section" id="logos">
          <h2>Logos</h2>
          <ul>
            ${data.logos.generalRules.map((r) => `<li>${esc(r)}</li>`).join("\n            ")}
          </ul>
          <div class="logo-grid">${data.logos.variants.map(logoCard).join("")}
          </div>
          <h3>Logo graphic</h3>
          <p>${esc(graphicMark.description)} ${esc(graphicMark.colorRule)}</p>
          <div class="logo-grid">
            <article class="logo-card">
              <div class="logo-card__preview">
                <img src="${esc(graphicMark.preview)}" alt="${esc(graphicMark.name)} preview" loading="lazy">
              </div>
              <h3>${esc(graphicMark.name)}</h3>${logoCardMeta([
    { label: "Download", value: `<a href="${esc(graphicMark.preview)}">${esc(graphicMark.preview.split("/").pop())}</a>` },
  ])}
            </article>
          </div>
        </section>`;

// --- Colors ---------------------------------------------------------

function swatch(color) {
  const cmyk = color.cmyk ? color.cmyk.join(", ") : "";
  const rgb = color.rgb ? color.rgb.join(", ") : "";
  const pms = color.pms ? (typeof color.pms === "string" ? color.pms : Object.entries(color.pms).map(([k, v]) => `${k} ${v}`).join(" / ")) : "";
  return `
          <div class="swatch">
            <div class="swatch__block" style="background:${esc(color.hex)}"></div>
            <div class="swatch__meta">
              <h3>${esc(color.name)}</h3>
              <dl>
                <dt>Hex</dt><dd><code>${esc(color.hex)}</code></dd>
                ${rgb ? `<dt>RGB</dt><dd>${esc(rgb)}</dd>` : ""}
                ${cmyk ? `<dt>CMYK</dt><dd>${esc(cmyk)}</dd>` : ""}
                ${pms ? `<dt>PMS</dt><dd>${esc(pms)}</dd>` : ""}
              </dl>
              ${color.usage ? `<p class="swatch__usage">${esc(color.usage)}</p>` : ""}
            </div>
          </div>`;
}

function metallicGoldSwatch(metallic) {
  return `
          <div class="swatch">
            <div class="swatch__block" style="background:${esc(data.colors.palette.find((c) => c.id === "gold").hex)}"></div>
            <div class="swatch__meta">
              <h3>Metallic Gold</h3>
              <dl>
                <dt>PMS</dt><dd>${esc(metallic.metallicPms)}</dd>
              </dl>
              <p class="swatch__usage">Print only. ${esc(metallic.foilGuidance)}</p>
            </div>
          </div>`;
}

const colorsSection = `
        <section class="section" id="colors">
          <h2>Color palette</h2>
          <p>${esc(data.colors.guidance.primaryPalette)}</p>
          <p>${esc(data.colors.guidance.secondaryPalette)}</p>
          <p>${esc(data.colors.guidance.continuity)}</p>
          <div class="swatch-grid">${data.colors.palette.map(swatch).join("")}${metallicGoldSwatch(data.colors.metallicGold)}
          </div>
        </section>`;

// --- Typography ---------------------------------------------------------

const typo = data.typography;
const typographySection = `
        <section class="section" id="typography">
          <h2>Typography</h2>
          <ul>
            ${typo.guidance.map((g) => `<li>${esc(g)}</li>`).join("\n            ")}
          </ul>
          <dl class="details">
            ${typo.families.map((f) => `<dt>${esc(f.name)}</dt><dd>${esc(f.roles.join(", "))}</dd>`).join("\n            ")}
          </dl>
          <div class="digital-note">
            <h3>On MarinOS digital products</h3>
            <p>${esc(typo.digitalImplementation.note)}</p>
            <dl class="details">
              <dt>Heading</dt><dd>${esc(typo.digitalImplementation.heading)}</dd>
              <dt>Body</dt><dd>${esc(typo.digitalImplementation.body)}</dd>
            </dl>
          </div>
        </section>`;

// --- File formats ---------------------------------------------------------

const ff = data.fileFormats;
const fileFormatsSection = `
        <section class="section" id="file-formats">
          <h2>File formats</h2>
          <p><strong>${esc(ff.masterArtworkRule)}</strong></p>
          <dl class="details">
            <dt>Print</dt><dd>${esc(ff.print.preferredFormat)} &mdash; ${esc(ff.print.description)} (${esc(ff.print.colorspaces.join(", "))}). ${esc(ff.print.scaling)}</dd>
            <dt>Web &amp; electronic</dt><dd>${esc(ff.webElectronic.preferredFormat)} &mdash; ${esc(ff.webElectronic.description)} (${esc(ff.webElectronic.colorspace)}).</dd>
          </dl>
        </section>`;

const sections = [
  { id: "overview", label: "Purpose", html: overviewSection },
  { id: "background", label: "Background & significance", html: backgroundSection },
  { id: "logos", label: "Logos", html: logosSection },
  { id: "colors", label: "Color palette", html: colorsSection },
  { id: "typography", label: "Typography", html: typographySection },
  { id: "file-formats", label: "File formats", html: fileFormatsSection },
];

const toc = sections.map((s) => `<li><a href="#${s.id}">${esc(s.label)}</a></li>`).join("\n            ");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Brand Center | MarinDocs</title><link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='12' height='12' rx='2'/%3E%3Crect x='27' y='9' width='12' height='12' rx='2'/%3E%3Crect x='9' y='27' width='12' height='12' rx='2'/%3E%3Crect x='27' y='27' width='12' height='12' rx='2'/%3E%3C/g%3E%3C/svg%3E">
    <meta name="description" content="${esc(data.purpose.summary)}">
    <link rel="stylesheet" href="../vendor/pico.min.css">
    <link rel="stylesheet" href="../shared/app-brand.css">
    <link rel="stylesheet" href="./styles.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to main content</a>
    <div class="marinos-banner"><div class="marinos-banner__inner"><div class="menu marinos-menu"><button type="button" class="menu-toggle marinos-menu__toggle" aria-expanded="false" aria-controls="marinos-menu-panel"><span class="marinos-banner__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><rect x="7" y="7" width="13" height="13" rx="2"/><rect x="28" y="7" width="13" height="13" rx="2"/><rect x="7" y="28" width="13" height="13" rx="2"/><rect x="28" y="28" width="13" height="13" rx="2"/></svg></span>MarinOS<sup>ALPHA</sup><svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></button><div id="marinos-menu-panel" class="menu-panel marinos-menu__panel" hidden><a href="https://marincountygov.github.io/marin-magic/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="m24 5 2.8 9.2L36 17l-9.2 2.8L24 29l-2.8-9.2L12 17l9.2-2.8zM37 28l1.6 5.4L44 35l-5.4 1.6L37 42l-1.6-5.4L30 35l5.4-1.6zM11 28l1.2 3.8L16 33l-3.8 1.2L11 38l-1.2-3.8L6 33l3.8-1.2z"/></svg></span>MarinMagic</a><a href="https://marincountygov.github.io/marin-waymaker/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="11" cy="12" r="4"/><circle cx="37" cy="12" r="4"/><circle cx="24" cy="37" r="4"/><path d="M15 12h18M35 16 26 33M13 16l9 17"/></svg></span>Marin WayMaker</a><a href="https://marincountygov.github.io/marin-docs/"><span class="marinos-menu__icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M13 6h17l8 8v28H13z"/><path d="M30 6v9h8M19 24h13M19 31h13"/></svg></span>MarinDocs</a><a class="marinos-menu__all" href="https://marincountygov.github.io/marin-os/">Browse all in MarinOS</a></div></div></div></div>
    <header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M13 6h17l8 8v28H13z"/><path d="M30 6v9h8M19 24h13M19 31h13"/></svg></span><nav class="breadcrumb-nav" aria-label="Breadcrumb"><a href="../index.html">MarinDocs</a> <span aria-hidden="true">/</span> Brand Center</nav></div></header>
    <main id="main" class="page" tabindex="-1">
      <div class="docs-layout">
        <article class="content">
          <h1 class="doc-title">County of Marin Brand Center</h1>
          <p class="doc-description">${esc(data.purpose.summary)}</p>
          <p class="doc-updated">Updated August 18, 2026</p>
          <div class="app-alert app-alert--warning"><strong>Draft.</strong> Verify values here against current County standards before treating them as final.</div>
          <div class="doc-actions">
            <div class="menu">
              <button type="button" class="doc-action menu-toggle" aria-expanded="false" aria-controls="share-menu-panel">Share<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></button>
              <div id="share-menu-panel" class="menu-panel" hidden><button type="button" data-action="share">Copy link</button></div>
            </div>
            <div class="menu">
              <button type="button" class="doc-action menu-toggle" aria-expanded="false" aria-controls="download-menu-panel">Download<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg></button>
              <div id="download-menu-panel" class="menu-panel" hidden><a href="index.html" download>Download HTML</a><a href="brand-center.json" download>Download JSON</a><a href="source-documents/county-of-marin-identity-style-guide-2014.pdf">Original PDF</a></div>
            </div>
            <span class="doc-action-status" role="status" aria-live="polite"></span>
          </div>
${sections.map((s) => s.html).join("\n")}
        </article>
        <aside class="toc" aria-label="On this page">
          <h2>On this page</h2>
          <ul>
            ${toc}
          </ul>
        </aside>
      </div>
    </main>
    <footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer>
    <a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a>
    <script src="../shared/app-shell.js"></script>
  </body>
</html>
`;

fs.writeFileSync(outPath, html);
console.log(`Generated brand/index.html from brand-center.json (${data.colors.palette.length} colors, ${data.logos.variants.length} logo variants).`);
