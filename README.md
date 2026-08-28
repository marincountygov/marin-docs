# MarinDocs

MarinDocs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marin-ui` and currently contains three collections: standard operating procedures, the Brand Center, and Guides.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `brand/`: Brand Center collection — see "Brand Center" below
- `guide/`: longer, multi-section reference documents — see "Guides" below
- `search/`: search tools collection (software catalog, etc.)
- `shared/`, `vendor/`, and `BRAND_VERSION`: vendored MarinOS brand bundle
- root-level document stubs: compatibility redirects for URLs that existed before the SOP collection moved
- root-level `sops.json` and `source-documents/`: compatibility copies retained for existing consumers

## Guides

`guide/` is for longer, multi-section documents meant to be used as a day-to-day reference rather than read cover to cover (the county's SB272/policy-length material) — see `marin-digital-standards/content-design/content-patterns.md`'s "Guide or explainer" content type and `marin-skills/forms-and-documents-skill`'s `pdf-vs-html-decision.md`/`document-conversion.md` for the standards this collection applies.

Like `sop/`, there is no generator: each guide page (`guide/<guide-slug>/*.html`) is a hand/AI-authored, standalone HTML file using the `.site-header`/`.breadcrumb-nav`/`.content`/`.doc-title`/`.doc-description`/`.doc-updated`/`.doc-actions` docs-shell pattern already shared with SOPs. A guide adds one new local layout on top of that: `.guide-layout` (defined in `guide/styles.css`), a three-column grid — a left-hand **guide outline** (every page in the guide, grouped by section, hand-duplicated across every page the same way `.topic-filters` already is in `sop/`), the page content, and the existing `.toc`/"On this page" right-hand column (automatic — no new JS — as long as the page's headings live inside `<article class="content">`; see `shared/app-shell.js`'s heading-anchor/scroll-spy behavior). Mark the current guide-outline link with `aria-current="page"` by hand, same as `.topic-filters` does today.

`guide/styles.css` also defines `.guide-callout--required`/`.guide-callout--best-practice` (a REQUIRED/BEST PRACTICE distinction, common in county policy documents) and `.guide-pager` (previous/next page links) — reuse these for any new guide rather than inventing another variant.

Keep the original source PDF in `guide/<guide-slug>/source-documents/` and link it from every page's `.doc-actions` ("Download PDF") — the PDF remains the official adopted record; the HTML is the day-to-day reading experience.

Add a new guide by: adding its pages under a new `guide/<guide-slug>/` folder, adding a card to `guide/index.html`, and adding an entry to `guide/guides.json` (a lightweight `schema.org ItemList`, structured exactly like `sop/sops.json` — not read by any page's JS, just a structured-data companion).

## Brand Center

`brand/index.html` is generated from `brand/brand-center.json`, the same way `sop/`'s pages are generated from their source documents — it does not edit itself. After changing `brand-center.json`, run:

```text
node scripts/build-brand-center.js
```

`brand-center.json` is a source-derived draft extracted from the County of Marin Identity Style Guide (updated May 2014) — it should be reviewed against current County standards before being treated as authoritative (the page itself carries a draft banner). Provenance detail lives in the JSON, not the rendered page: `light-gray`'s hex was resolved from a truncated source value (see its `verificationNote`), and the Typography section documents the deliberate divergence between the 2014 print guide's guidance and what MarinOS digital products actually use (Jost, not Futura/Verdana — see `marin-digital-standards/brand/typography.md`).

Logo preview images live in `brand/assets/reference-previews/` (filenames must match `brand-center.json`'s `preview` fields exactly), the original PDF in `brand/source-documents/`, and any approved master artwork (EPS/high-res PNG, distinct from the reference-preview crops) in `brand/assets/master/`.

## Brand bundle

The installed bundle version is recorded in `BRAND_VERSION`. Update the files from the matching `marin-ui` release together; do not update individual shared files independently.

## Keeping the "Updated" date accurate

Each SOP page's "Updated [date]" line reflects git history, not a typed-once string. Before committing content changes, run:

```text
node scripts/stamp-updated-dates.js
```

A dirty file gets stamped with today's date; a clean file gets its actual last-commit date. There is no CI gate enforcing this (the stamp is written before the commit that fixes it exists, so a `--check` step in CI reliably fails against the just-created commit) — run the script yourself before committing instead.

## Run locally

Open `index.html` directly or serve this folder with any static web server. Document headings receive hover/focus anchor links, and the current section is highlighted in the “On this page” navigation as the reader scrolls.

For WAVE extension testing, use `python3 -m http.server 8000` and open `http://localhost:8000/`. Direct `file://` testing requires the extension to have local-page access.
