# Marin Docs

Marin Docs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marin-ui` and currently contains two collections: standard operating procedures and Guides.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `guides/`: longer, multi-section reference documents — see "Guides" below
- `search/`: search tools collection (software catalog, etc.)
- `vendor/`: the installed MarinOS App Shell (`vendor/marinos/`) and its fonts and icons
- root-level document stubs: compatibility redirects for URLs that existed before the SOP collection moved
- root-level `sops.json` and `source-documents/`: compatibility copies retained for existing consumers

## Guides

`guides/` is for longer, multi-section documents meant to be used as a day-to-day reference rather than read cover to cover (the county's SB272/policy-length material) — see `marin-digital-standards/content-design/content-patterns.md`'s "Guide or explainer" content type and `marin-skills/forms-and-documents-skill`'s `pdf-vs-html-decision.md`/`document-conversion.md` for the standards this collection applies.

Like `sop/`, there is no generator: each guide page (`guides/<guide-slug>/*.html`) is a hand/AI-authored, standalone HTML file using the `.site-header`/`.breadcrumb-nav`/`.content`/`.doc-title`/`.doc-description`/`.doc-updated`/`.doc-actions` docs-shell pattern already shared with SOPs. A guide adds one new local layout on top of that: `.guide-layout` (defined in `guides/styles.css`), a three-column grid — a left-hand **guide outline** (every page in the guide, grouped by section, hand-duplicated across every page the same way `.topic-filters` already is in `sop/`), the page content, and the existing `.toc`/"On this page" right-hand column (automatic — no new JS — as long as the page's headings live inside `<article class="content">`; see `shared/app-shell.js`'s heading-anchor/scroll-spy behavior). Mark the current guide-outline link with `aria-current="page"` by hand, same as `.topic-filters` does today.

`guides/styles.css` also defines `.guide-callout--required`/`.guide-callout--best-practice` (a REQUIRED/BEST PRACTICE distinction, common in county policy documents) and `.guide-pager` (previous/next page links) — reuse these for any new guide rather than inventing another variant.

Keep the original source PDF in `guides/<guide-slug>/source-documents/` and link it from every page's `.doc-actions` ("Download PDF") — the PDF remains the official adopted record; the HTML is the day-to-day reading experience.

Add a new guide by: adding its pages under a new `guides/<guide-slug>/` folder, adding a card to `guides/index.html`, and adding an entry to `guides/guides.json` (a lightweight `schema.org ItemList`, structured exactly like `sop/sops.json` — not read by any page's JS, just a structured-data companion).

### Structured guides

A guide built from data instead of hand-written HTML (`guides/engage-marin/` is the first). Its words live in one Markdown file; a small config beside it names what is structured; `node scripts/build-guide.js` (all guides) or `node scripts/build-guide.js <slug>` writes every page, a JSON-LD block in each page, and `structured-data.json` (the whole guide). Edit the Markdown or the config, never the generated pages, then run the build and `node scripts/stamp-updated-dates.js`. `tests/test_generated.py` fails when a guide's pages are out of date and builds a small made-up guide to prove a second guide needs nothing but Markdown and a config.

**Adding a guide**
1. Create `guides/<slug>/source/<name>.md` and `guides/<slug>/data/guide.json`. The config is checked against [`guides/schema/guide.schema.json`](guides/schema/guide.schema.json), which documents every setting; the build stops with a plain message when it does not match.
2. Markdown rules: an H2 is a page, an H3 is a section of that page (and an entry in "On this page"); paragraphs, bullet and numbered lists, tables, `- [ ]` checklists, bold, italics and links keep their shape. A first H1 and `---` lines are ignored. The first paragraph of a page is its description.
3. The config needs `slug`, `name`, `description`, `audience`, `publisher`, `baseUrl`, `source` and `groups` (the left menu: every page, in reading order). Everything else is optional: `indexPage` and `titles` (which H2 is the home page, and renaming pages), `split` (an H3 becomes its own page), `home` (sections of linked pages on the home page; without it the home page lists the groups), `lifecycle` (an ordered process: each step gets a landing page and a numbered bar above its pages), `pages` (a page's lifecycle step, limits, links), `specs` and `specsPage` (content limits, each tied to the sentence that states it), `terms` (key terms for the data), `links` and `linkPages` (pages of named links, such as Links and Learn), and `labels`.
4. Add the guide's card to `guides/index.html` and its entry to `guides/guides.json` by hand.

Each page's Link, Copy and Download buttons carry only what to do (`data-action="share"`, `data-copy-format`, `data-download-format`); `guides/guide-actions.js` builds the page's text, HTML and Markdown and passes them to the shell's `marinCopyRich`, `marinCopyText` and `marinDownload`. Copy and Download list Text, HTML, Markdown; Download adds the page's JSON and the whole guide's JSON.

**Not covered yet.** The Public Engagement Plan and the Personnel Management Regulations are not built this way: the Plan is hand-written HTML with REQUIRED and BEST PRACTICE callouts and a PDF link, and the Regulations come from the Policy Knowledge Model's JSON with an Interactive/Original text toggle. Moving them over needs callouts in the Markdown (for example a labeled blockquote), a per-guide source-document link, and a rule for views, so it is a separate piece of work. Images, footnotes and H4 headings inside a section are not converted.

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
