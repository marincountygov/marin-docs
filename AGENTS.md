# Working on this Marin application

## Architecture

This is a static, zero-build MarinOS docs-shell application. It uses the MarinOS App Shell (installed with `marin-app-shell/scripts/install.sh`, version recorded in `platform.shell` in `marin.yml`) and follows `marin-digital-standards`. See `marin.yml` for this project's owner, status, and platform versions.

## Before making changes

1. Check `marin-ui/docs/components.md` for an existing pattern before writing new CSS or JS.
2. Prefer existing semantic tokens over raw values.
3. Keep the default view immediately functional — info/how-to content belongs in the About tab, not stacked above or alongside the content.
4. Every page below the home page (SOPs, guides, PMRs) has the full MarinOS shell and no breadcrumb: the shell header with About and Updates, the page content as the default tab, the About/Security/Updates sections, the shell footer and Feedback (`scripts/shell-chrome.js`, as Marin Budget does on its inner pages). The generators add it; for a page written by hand run `node scripts/apply-shell.js`. The SOP sub-pages stay always-visible (their Text/Flow tabs are their own).
5. Guide pages (`guides/<guide-slug>/*.html`) follow the same docs-shell pattern as SOPs, plus a local `.guide-layout` three-column grid (guide outline / content / on-this-page) defined in `guides/styles.css` — see the "Guides" section of `README.md` before adding a new guide or a new guide page.

## Before finishing

Run `bash scripts/check.sh` (shell integrity, the button audit, and `tests/test_generated.py`, which fails when a generated guide page is out of date, a link or file reference is broken, a page has no single h1, or an SOP's JSON-LD does not parse) and `bash scripts/check.sh --browser` (adds `tests/browser_docs.py`: tabs, filter chips, flow steps, the Download menu, Share and the PDF link on one page of each kind; it needs Playwright for Python with Chromium). After changing a Markdown-built guide (`guides/<slug>/source/*.md` or `data/guide.json`, checked against `guides/schema/guide.schema.json`), `guides/guide-actions.js` or `scripts/build-guide.js`, run `node scripts/build-guide.js` then `node scripts/stamp-updated-dates.js`; do not edit the generated pages. After changing, adding or removing an SOP, guide page or PMR page, run `node scripts/build-search-index.js` (it writes `search-index.json`, the list the home page search box and the MarinOS search read, and the per-set text files `pmrs/search.json`, `guides/<guide>/search.json` and `sop/search.json` that the search boxes in the left navigation read). The SOPs in `sop/sops.json` are the listed ones; the others stay out of every list, the navigation and the search (`scripts/sop-list.js`); `check.sh` fails when it is out of date. `data/search-index.json` is a copy from marin-data; never edit it. The left navigation of every guide page, PMR and SOP is `scripts/doc-nav.js` (the standard is in `marin-ui/docs/components.md`, "Document set outline"); the guide and PMR generators call it, and after adding or renaming an SOP run `node scripts/build-sop-nav.js`. Do not write the navigation by hand. A regulation's details (effective, prepared by, approved by) are `scripts/doc-details.js`: only the rows the data has, in the data's words, nothing filled in (standard: "Document details" in `marin-ui/docs/components.md`). Printing a document is part of the same shared stylesheet (`doc-nav.css`, the `@media print` block) and every document's Download menu ends with "Print or save as PDF"; the generators add the menu item, and `sop/sop-actions.js` handles it on procedures (standard: "Printing a document" in `marin-ui/docs/components.md`). Search results show a snippet and mark the searched words on the page they open (`home-search.js` and `doc-search.js` use the shell's `marinSearchSnippet` and `marinSearchRemember`, and the shell marks the words on arrival; the standard is in `marin-ui/docs/components.md`). Then manually verify against the review checklist in `marin-skills/marin-app-builder/SKILL.md`: metadata placeholders replaced, nav includes About and Updates, accessibility basics, no invented components.

## References

- `marin-ui` — shared components, tokens, app shell: https://github.com/marincountygov/marin-ui
- `marin-digital-standards` — accessibility, content, brand, and product-design requirements: https://github.com/marincountygov/marin-digital-standards
- `marin-skills` — AI workflows for building and reviewing Marin applications, including `marin-app-builder` and `app-maintainer`: https://github.com/marincountygov/marin-skills
- `marin-os` — the MarinOS app directory this project is registered in: https://github.com/marincountygov/marin-os
