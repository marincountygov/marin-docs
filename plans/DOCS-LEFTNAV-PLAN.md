# Plan: one left navigation for every kind of document in Marin Docs

Status: decisions made (all recommendations accepted, 2026-11-23). Built: the standard (`marin-ui/docs/components.md`), PMRs, guides and SOPs. Left: update `marin-skills` and the app template to point at the standard.

One change from the first draft: on a narrow screen the navigation is a bordered box above the content (as guides had), not a closed disclosure. With only the current group open it is short enough, and the box needs no script.

## The problem

A person reading PMR 24 cannot see the other 28 regulations, or which Section it belongs to, without going back to the list. A guide page already can: it has a left outline and a right "On this page". An SOP has neither. Three kinds of document, three different answers to "where am I, and what else is here?"

## What each kind has today

| Kind | Set it belongs to | Grouping | Order comes from | Left nav now |
|---|---|---|---|---|
| Guide page | one guide (50 pages in 2) | named groups: Overview, Lifecycle, Part 1, Part 2, Reference | `guide.json` `groups` (owned here) | Yes, `.guide-outline` |
| PMR | the manual (29 regulations) | 4 Sections (General and Administration, Personnel Conduct, Recruitment, Employment Practices) | `manual.jsonld` `hasPart` and `position` (owned by marin-data) | No |
| SOP | the SOP collection (3 documents) | a department and a unit, named in each SOP's own data | `sops.json` list; department from each SOP | No |

Under each document the right column ("On this page") lists its own sections. That already works for all three and is not the problem.

## The standard: a document set outline

One shape, three levels, the same on every kind of document:

1. **The set** (a guide, the PMR manual, the SOP collection): a title that links to its list page.
2. **Groups** inside it (a guide's parts, a PMR Section, an SOP department): a heading each.
3. **Documents** in each group: a link each. The one being read is marked `aria-current="page"` and bold, as guides do now.

Sections of the document being read stay in the right column. The left nav answers "which document", the right answers "where in this document".

### The data it reads

Not a new file people write. A small shape that each collection's build already has the facts for:

```
{ "set":    { "name": "Personnel Management Regulations", "href": "pmrs/" },
  "groups": [ { "name": "Section 1: General and Administration",
                "items": [ { "label": "PMR 1: Purpose & Authority", "href": "pmr-1.html" }, ... ] } ] }
```

| Kind | Built from | New data to write |
|---|---|---|
| PMR | `manual.jsonld`: the Sections (`codificationLevel: part`) in `position` order, each with its regulations in `position` order | None. It is the same tree the list page uses. |
| Guide | `guide.json` `groups` | None. It is what renders today. |
| SOP | the SOP's department in its JSON-LD, with `sops.json` for order | None to start. Three documents is one or two groups. |

The build writes the shape and renders the markup from it, so the nav is plain HTML: no JavaScript, nothing to go stale. One shared function (`scripts/doc-nav.js`) does the rendering for all three generators, and one stylesheet rule set replaces `.guide-outline` and anything the PMR and SOP pages would add.

### Layout

- Wide screen: left nav 14rem, content, right "On this page" 15.5rem. This is the guide layout today (`.guide-layout`), so guides do not change.
- Narrow screen: the left nav folds above the content into one "In this set" disclosure (`<details>`), closed. Guides fold the same way now below 850px; the new function keeps that.
- A set with many documents (the 29 PMRs) shows every group heading, but only the group that holds the current document is open; the others are `<details>` that open on press. No JavaScript.
- Sticky at the top of the column, like the guide outline.

## Decisions for you

1. **Sections of the current document: right column only, or also under it in the left nav?** Recommendation: right only. The left nav stays short and the same on every page of the set, and the right column already does the job.
2. **Label for a PMR in the nav**: the full "PMR 24: Grievance Procedure", or the number and a short name? Recommendation: the full title, which wraps at 14rem; it is how the list page and the search read.
3. **Does the SOP collection get groups by department now, or one flat list until there are more than a handful?** Recommendation: flat until there are about 8, then group by department. Three documents do not need a grouping.
4. **Where the standard lives.** Recommendation: write it into `marin-ui/docs/components.md` as "Document set outline" (the markup and the data shape above), build it first in marin-docs, and move the renderer into the shell later if a second app needs it. Do not start in the shell.
5. **The Learn app and others with "a course and its lessons"** are the same shape. Not in scope here, but the standard should say how they would use it.

## Build order

1. **Write the standard** (components.md): the three levels, the data shape, the layout, the narrow screen, the accessibility (a `nav` with a label, `aria-current="page"`, groups as headings or `<details>`).
2. **PMRs first.** The data is richest and the left nav is missing entirely. `build-pmrs.js` gets the new function; `.pmr-layout` becomes the same three columns as `.guide-layout`.
3. **Guides** switch to the shared function with no change to what people see, which proves the function is the standard and not a second copy.
4. **SOPs** last, once decision 3 is made.
5. **Close-out:** update `marin-skills` and the app template to point at the standard, and add a test to `tests/test_generated.py` that every document page in a set has a nav and that exactly one link in it is the current page.

## Not part of this

- Search. It reads `search-index.json`, a different file for a different job, though both come from the same pages.
- Breadcrumbs. They exist on these pages today and are left as they are.
- Merging the SOP and PMR data models. The nav needs only names, order and groups, which both already have.
