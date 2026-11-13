# Marin Docs

Marin Docs is the County of Marin documentation hub. It uses the MarinOS Docs shell from `marin-ui` and currently contains two collections: standard operating procedures and Guides.

## Structure

- `index.html`: documentation landing page
- `sop/`: SOP collection, HTML documents, JSON-LD, and source files
- `guides/`: longer, multi-section reference documents — see "Guides" below
- `search/`: search tools collection (software catalog and job classes and pay lookup)
- `organization/`: County service areas, departments, divisions and other bodies, one page each, generated from schemaGov JSON-LD — see "Organization" below
- `service-areas/`: the County's service areas, a page each listing its programs, and `programs/`: a page for each program. Both are written by `scripts/build-organization.js` from the same data
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

## Organization

`organization/` is built from schemaGov JSON-LD, not written by hand. The data is `organization/data/organizations.jsonld` and `jurisdictions.jsonld`, converted from the County's agency list. Run `node scripts/build-organization.js <folder with the two files>` to copy new data in and rewrite `organization/index.html` and one page per organization. Edit the data, never the generated pages. Hierarchy comes only from each organization's `parentOrganization`.

An organization page opens on a Dashboard: a tight look at each of its other tabs (About, Divisions, Programs, Budget, People, and the Mentions, Reach and Links apps), each with a link to the tab for more. The tabs follow: About, then the tabs the organization has, then Data. On a page with tabs the Copy, Link and Download buttons sit below the tabs and follow the open tab: they copy and download that tab, files are named for it (`cda-programs.md`), and JSON and CSV are offered only on the tabs that have them; the Dashboard offers only the link. Organization, service area and budget pages have Copy, Link and Download buttons (`scripts/page-actions.js`, wired by the shell); the Dashboard is left out of what they copy. Where a page carries its data (an organization, a service area, the funds and the budget tables) Copy and Download also offer JSON: the page's JSON-LD record, exactly as the data has it (`organization/page-data.js`). Download also offers a CSV for each table a page holds (a department's programs and budget, the budget tables, the funds, the lists of organizations and service areas); the rows are written into the page and turned into a CSV with a byte-order mark by `organization/page-data.js`. Organization, service area and program pages end with an Insights tab: choose what to include, add a question, and copy a prompt for a chatbot that holds the page's structured data (about, people, programs, budget, and, from the published sources when the tab opens, Mentions, Reach campaigns and Links). Like Marin Spec's prompts it names no AI product and calls no AI service; `scripts/insights.js` writes the tab and `organization/insights.js` builds the prompt. Telephone numbers are `tel:` links; a number that is not a whole US number stays plain text.

The data also holds programs, people, posts and roles (`programs.jsonld`, `people.jsonld`, `posts.jsonld`, `roles.jsonld`), copied the same way. A body's page has a Programs tab for the programs it administers (with those of the bodies under it) and a People tab for the seats it holds. Service areas have their own section (`service-areas/`) and no pages under `organization/`; each lists its programs, and every program has a page under `programs/` that links to its agency. The Organization homepage lists the departments, offices and other bodies; divisions are listed on their department's page. Some missions in the data end with the department's address, phone, web address or the department head's name. The build leaves those off the page (`cleanMission` in `scripts/build-organization.js`); the data is not changed, and the fix belongs in the data's source.

## Budget on organization pages

The Budget and Capital improvement plan pages are in [marin-budget](https://github.com/marincountygov/marin-budget) (https://marincountygov.github.io/marin-budget/). The Budget tab on organization, service area and program pages stays here. It reads the budget files in `../marin-data/output` (`budgets.jsonld`, `budget-lines.jsonld`, `source/budget-display.json`, `funds.jsonld`, `sources.json` and `budget-2025-26/schedules.json`) when `node scripts/build-organization.js` runs; it keeps no copy of them. To read another folder, run `node scripts/build-organization.js <folder with the files>` or set `MARIN_DATA_OUTPUT`. `scripts/budget-data.js` builds the tables and `scripts/budget-2025-org.js` adds the FY 2025-26 Final Budget rows. Links from a Budget tab to a fund page, a schedule or the budget data are absolute links to marin-budget (`BUDGET_SITE` in `scripts/budget-data.js`).

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

## Job classes and pay search

`search/job-classes-pay/` uses the same search/facet layout as the software catalog. It reads the public [Job Classifications and Pay Rates](https://data.marincounty.gov/d/w7uw-fvda) JSON feed in the browser, with a six-hour browser-local cache and a stale-copy fallback when offline. Users can search, sort, filter by title/pay/hour schedule/step count, open the published pay-step details, compare up to three classifications, and export the filtered results (CSV or JSON). It shows **job classification** pay ranges, not individual employee compensation. The scope is limited to job classifications and their published pay ranges.

Run `node tests/test_job_pay.js` for dataset-normalization regression tests, `python3 tests/browser_job_pay_embedded.py` for network-free browser/DOM tests, and `python3 tests/browser_job_pay.py` for mock-feed HTTP/browser tests. None of these tests calls the live County dataset or creates records.
