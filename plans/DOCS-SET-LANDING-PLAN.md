# Plan: a landing page for each document set, with search inside the set and cards built from structured data

Status: decisions made 2026-11-23. Built for the PMRs: four Section cards (each lists its regulations as links) and the scoped search, on the list page and in the left navigation of every guide page, PMR and SOP. Not built: cards with descriptions for guides and SOPs.

Correction: the SOP list shows one SOP on purpose. The commit "Hide two SOPs" (2026-10-27) left the fleet and road procedures off every list and the structured list, and keeps their pages in place. Everything built here respects that (`scripts/sop-list.js`). The "bug" in the table below is not a bug, and decision 5 (fix the list) is withdrawn. Follows `DOCS-LEFTNAV-PLAN.md` (the left navigation, built). Reference page: `/pmrs/`.

A "set" is a guide, the PMR manual, or the SOP collection. Its landing page is the list page: `pmrs/`, `sop/`, `guides/<guide>/`.

## Where each landing page is today

| Set | Landing page now | Where its data lives |
|---|---|---|
| PMRs | Four Section headings, each a bullet list of links. No descriptions, no search. | `manual.jsonld` and `regulations.jsonld` (marin-data): 4 Sections, 29 regulations, 241 numbered sections. Each regulation has a name, a description (74 to 621 characters, average 188), a part count, an effective date and who prepared it. |
| SOPs | Topic pills and one card (Airfield). Two of the three SOPs are not listed. | `sops.json` (names only) and each SOP's own JSON-LD (description, department, unit, topics). |
| Guides | The list of guides is cards (`.app-card`). Inside a guide, the start page is an ordinary page. | `guides.json` (names only) and each `guide.json` (description, groups, pages). |

Three different looks, three different sources, and only the PMR page shows its real hierarchy. The second row is a bug to fix on the way: `sop/index.html` lists one SOP of three, and its topic pills show two of the four topic pages that exist (Procurement and Roads & Infrastructure are missing).

## The idea: one derived "set outline", read by four things

Every set already has authoritative structured data. Do not make a new file to write by hand. Add one small adapter per kind that reads that data at build time and writes the same shape:

```
{ "set":    { "id": "pmr", "name": "Personnel Management Regulations", "description": "...", "href": "./" },
  "groups": [ { "name": "Section 1: General and Administration",
                "items": [ { "label": "PMR 1: Purpose & Authority", "href": "pmr-1.html",
                             "description": "...", "meta": ["5 sections", "Effective 2005-01"] } ] } ] }
```

This is the left navigation's data (plan 1) with two fields added, `description` and `meta`. The navigation ignores them. One outline per set then feeds:

1. the left navigation (label, href, current),
2. the landing page cards (label, description, meta, grouped),
3. the search list (`search-index.json`, which already gets its entries from the same pages),
4. the search inside the set (below).

A change to a PMR in marin-data, or a new guide page, changes all four after one build. Nothing is kept in step by hand.

| Kind | Adapter reads | Card title | Card description | Card meta (only what the data holds) |
|---|---|---|---|---|
| PMR | `manual.jsonld`, `regulations.jsonld` | "PMR 24: Grievance Procedure" | the regulation's `description`, clipped to 3 lines | "5 sections", "Effective 2005-01" |
| Guide page | `guide.json` | page title | the page's description | the guide's group, if shown outside it |
| SOP | the SOP's JSON-LD and `sops.json` | name | description | department, unit |

Cards show only text the data holds. No summaries are written for them (the rule against unprompted explanatory text), and a field that is missing is not drawn.

## The cards

- **One card pattern for the three sets**: `.app-card` inside `docs-grid docs-grid--3` (three to a row, one on a phone), the pattern the guides list and the Docs home page already use. The SOP page's own `.card` goes away.
- **A card is**: the title as the link, the description, then a meta line in the muted color. The whole card is not a link; the title is, as on the home page.
- **Groups are headings with their cards below**, in the data's order (Section 1 to 4; a guide's parts). A heading carries a count only when it is useful (`Section 2: Personnel Conduct… (8)`); it never carries explanation.
- **Static HTML written at build time.** The page is complete without JavaScript, and a search engine and a screen reader get the same page.
- **A set with no groups** (the SOP collection, for now) is one grid with no heading.
- The same card component should be the way the Docs home lists the three sets, so "card" means one thing.

## Search inside the set

A box at the top of the landing page, the same field and results line as the MarinOS and Docs home search (`.search-input-field`, `N results / matching “word”`). It searches only that set.

- **Two levels of match.** A document whose title, description or any of its sections matches stays as a card; the cards that do not match are hidden. Under a matching card, the sections that matched are listed as plain links (`PMR 35.2 Probationary period`) that open the page at that heading. Typing `probation` shows the handful of regulations that talk about probation and the exact sections.
- **Where the words come from.**
  - Titles, descriptions and section titles: already in `search-index.json`. Add two fields to each entry, `s` (the set: `pmr`, `sop`, `engage-marin`) and `p` (the document it belongs to), so a search can be limited to one set and a section can sit under its card. The home page and MarinOS ignore the new fields.
  - The full text: about 400 KB for the PMRs and 100 KB for the guides, too big for the shared list. A per-set file, `pmrs/search-text.json`, built with the page and loaded only when the box is focused (it compresses to about a quarter on GitHub Pages). The list keeps its present size. An SOP set is small enough to include in full.
- **Same rules as the other boxes**: lower case, accents ignored, every word must start a word, a name beats a description beats body text, and `5.3` is split into `5` and `3`. A section number typed as `24.3` or `PMR 24.3` finds that section first.
- **Empty box** shows every group again. Escape clears it. Without JavaScript the box is hidden and the full cards remain.
- **Facets only where the data has them.** PMRs have none (the Section is the grouping). The SOP set has topics and department; when it has more than a few documents it gets the standard filter column (checkbox groups, multi-select), and the search box sits above it. Do not add a filter column to a set that has nothing to filter.

## How this meets the left navigation

The navigation is "where am I in the set"; the landing is "what is in the set, and find one". They share the outline, so a document appears in the same order, with the same label, in both. On the landing page itself the left navigation is not shown: the cards are the navigation. (The set title in the navigation of a document links back to the landing page.)

## Decisions for you

1. **What "sections" means on the landing page.** I read it as: each group (a PMR Section, a guide's part, an SOP department) is a heading with a grid of cards for its documents. The other reading is that the PMR Sections themselves are the cards (four big cards, each opening a page of its regulations). Recommendation: documents as cards under group headings. Four cards would hide the 29 regulations one click deeper.
2. **How much text on a card.** Recommendation: the data's own description, clipped to three lines, plus at most two meta items. The longest PMR description is 621 characters; clipping keeps the cards even.
3. **Full text search: one file per set, loaded on focus, or put the whole text in the shared list.** Recommendation: per set, on focus. The shared list stays about 100 KB.
4. **Sections that match: listed under the card, or the card opens and the page highlights the words.** Recommendation: listed under the card now; highlighting on the document page can come later.
5. **Fix the SOP page first.** It lists one SOP of three. Recommendation: do this as step 1, since the new landing would otherwise reproduce it.

## Build order

1. Write the standard in `marin-ui/docs/components.md` ("Document set landing page": the outline shape, the card, the grouped grid, the scoped search). Extend the left navigation standard to name `description` and `meta` as the optional fields.
2. Add `description` and `meta` to the outline in `scripts/doc-nav.js`'s callers, and write the landing renderer (`scripts/doc-landing.js`) beside it. Build the PMR landing first, from `build-pmrs.js`.
3. Add `s` and `p` to `search-index.json` and the per-set text file; write the scoped search script, shared by every landing page. Test: `probation` on `/pmrs/` finds PMR 35 and its section; `24.3` finds that section first; Escape restores the groups; no overflow on a phone.
4. Guides, then SOPs (and the fix that lists all three).
5. Make the Docs home list the three sets with the same card.
6. Close-out: `marin-skills` and the app template point at the standard; tests that every landing page has one card per document in its outline, and that the cards and the left navigation list the same documents in the same order.

## Not part of this

- Writing summaries for cards, or any explanatory line about a set.
- A search that spans several sets: that is the Docs home page and MarinOS.
- Merging the SOP and PMR data models; the outline needs only names, order, groups, a description and a few meta values, which both already have.
