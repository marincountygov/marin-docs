# MarinDocs

MarinDocs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marin-ui` and currently contains two collections: standard operating procedures, and the Brand Center.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `brand/`: Brand Center collection — see "Brand Center" below
- `shared/`, `vendor/`, and `BRAND_VERSION`: vendored MarinOS brand bundle
- root-level document stubs: compatibility redirects for URLs that existed before the SOP collection moved
- root-level `sops.json` and `source-documents/`: compatibility copies retained for existing consumers

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

A dirty file gets stamped with today's date; a clean file gets its actual last-commit date. `.github/workflows/check-updated-date.yml` fails the PR if a page's date doesn't match (`node scripts/stamp-updated-dates.js --check`).

## Run locally

Open `index.html` directly or serve this folder with any static web server. Document headings receive hover/focus anchor links, and the current section is highlighted in the “On this page” navigation as the reader scrolls.

For WAVE extension testing, use `python3 -m http.server 8000` and open `http://localhost:8000/`. Direct `file://` testing requires the extension to have local-page access.
