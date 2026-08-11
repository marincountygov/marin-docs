# MarinDocs

MarinDocs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marinappsbrand` and currently contains one collection: standard operating procedures.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `shared/`, `vendor/`, and `BRAND_VERSION`: vendored MarinOS brand bundle
- root-level document stubs: compatibility redirects for URLs that existed before the SOP collection moved
- root-level `sops.json` and `source-documents/`: compatibility copies retained for existing consumers

## Brand bundle

The installed bundle version is recorded in `BRAND_VERSION`. Update the files from the matching `marinappsbrand` release together; do not update individual shared files independently.

## Run locally

Open `index.html` directly or serve this folder with any static web server. Document headings receive hover/focus anchor links, and the current section is highlighted in the “On this page” navigation as the reader scrolls.

For WAVE extension testing, use `python3 -m http.server 8000` and open `http://localhost:8000/`. Direct `file://` testing requires the extension to have local-page access.
