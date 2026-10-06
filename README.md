# Marin Docs

Marin Docs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marin-ui` and currently contains two collections: standard operating procedures and Guides.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `guide/`: longer, multi-section reference documents — see "Guides" below
- `search/`: search tools collection (software catalog, etc.)
- `vendor/`: the installed MarinOS App Shell (`vendor/marinos/`) and its fonts and icons
- root-level document stubs: compatibility redirects for URLs that existed before the SOP collection moved
- root-level `sops.json` and `source-documents/`: compatibility copies retained for existing consumers

## Guides

`guide/` is for longer, multi-section documents meant to be used as a day-to-day reference rather than read cover to cover (the county's SB272/policy-length material) — see `marin-digital-standards/content-design/content-patterns.md`'s "Guide or explainer" content type and `marin-skills/forms-and-documents-skill`'s `pdf-vs-html-decision.md`/`document-conversion.md` for the standards this collection applies.

Like `sop/`, there is no generator: each guide page (`guide/<guide-slug>/*.html`) is a hand/AI-authored, standalone HTML file using the `.site-header`/`.breadcrumb-nav`/`.content`/`.doc-title`/`.doc-description`/`.doc-updated`/`.doc-actions` docs-shell pattern already shared with SOPs. A guide adds one new local layout on top of that: `.guide-layout` (defined in `guide/styles.css`), a three-column grid — a left-hand **guide outline** (every page in the guide, grouped by section, hand-duplicated across every page the same way `.topic-filters` already is in `sop/`), the page content, and the existing `.toc`/"On this page" right-hand column (automatic — no new JS — as long as the page's headings live inside `<article class="content">`; see `shared/app-shell.js`'s heading-anchor/scroll-spy behavior). Mark the current guide-outline link with `aria-current="page"` by hand, same as `.topic-filters` does today.

`guide/styles.css` also defines `.guide-callout--required`/`.guide-callout--best-practice` (a REQUIRED/BEST PRACTICE distinction, common in county policy documents) and `.guide-pager` (previous/next page links) — reuse these for any new guide rather than inventing another variant.

Keep the original source PDF in `guide/<guide-slug>/source-documents/` and link it from every page's `.doc-actions` ("Download PDF") — the PDF remains the official adopted record; the HTML is the day-to-day reading experience.

Add a new guide by: adding its pages under a new `guide/<guide-slug>/` folder, adding a card to `guide/index.html`, and adding an entry to `guide/guides.json` (a lightweight `schema.org ItemList`, structured exactly like `sop/sops.json` — not read by any page's JS, just a structured-data companion).

## Brand Center

The Brand Center (County of Marin logo, color, and typography reference, extensible to other Marin brands) moved to its own repo: [marincountygov/marin-brand](https://github.com/marincountygov/marin-brand). It is no longer part of this repo.

## Brand bundle

The installed App Shell version is recorded in `marin.yml` (`platform.shell`). Update it with the App Shell installer from `marin-app-shell`, not by editing files in `vendor/` by hand.

## Keeping the "Updated" date accurate

Each SOP page's "Updated [date]" line reflects git history, not a typed-once string. Before committing content changes, run:

```text
node scripts/stamp-updated-dates.js
```

A dirty file gets stamped with today's date; a clean file gets its actual last-commit date. There is no CI gate enforcing this (the stamp is written before the commit that fixes it exists, so a `--check` step in CI reliably fails against the just-created commit) — run the script yourself before committing instead.

## Security

Marin Docs follows the [MarinOS security standard](https://github.com/marincountygov/marin-digital-standards/blob/main/security/standard.md). See [`SECURITY.md`](SECURITY.md) to report an issue, or the app's own `#security` section for a plain-language summary.

## Run locally

Open `index.html` directly or serve this folder with any static web server. Document headings receive hover/focus anchor links, and the current section is highlighted in the “On this page” navigation as the reader scrolls.

For WAVE extension testing, use `python3 -m http.server 8000` and open `http://localhost:8000/`. Direct `file://` testing requires the extension to have local-page access.
