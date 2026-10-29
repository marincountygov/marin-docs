# Working on this Marin application

## Architecture

This is a static, zero-build MarinOS docs-shell application. It uses the MarinOS App Shell (installed with `marin-app-shell/scripts/install.sh`, version recorded in `platform.shell` in `marin.yml`) and follows `marin-digital-standards`. See `marin.yml` for this project's owner, status, and platform versions.

## Before making changes

1. Check `marin-ui/docs/components.md` for an existing pattern before writing new CSS or JS.
2. Prefer existing semantic tokens over raw values.
3. Keep the default view immediately functional — info/how-to content belongs in the About tab, not stacked above or alongside the content.
4. Individual SOP sub-pages (`sop/*.html`) use the `.site-header`/`.site-footer` docs-shell pattern and stay always-visible (no JS-dependent tabs) — see the landing page for where the tab-section pattern applies instead.
5. Guide pages (`guides/<guide-slug>/*.html`) follow the same docs-shell pattern as SOPs, plus a local `.guide-layout` three-column grid (guide outline / content / on-this-page) defined in `guides/styles.css` — see the "Guides" section of `README.md` before adding a new guide or a new guide page.

## Before finishing

Run `bash scripts/check.sh` (shell integrity, the button audit, and `tests/test_generated.py`, which fails when a generated guide page is out of date, a link or file reference is broken, a page has no single h1, or an SOP's JSON-LD does not parse) and `bash scripts/check.sh --browser` (adds `tests/browser_docs.py`: tabs, filter chips, flow steps, the Download menu, Share and the PDF link on one page of each kind; it needs Playwright for Python with Chromium). After changing the PMR generator or its data, run `node scripts/build-pmr-guide.js` then `node scripts/stamp-updated-dates.js`. After changing the Engage Marin playbook (`guides/engage-marin/source/playbook.md` or `data/guide.json`) or `scripts/build-guide.js`, run `node scripts/build-guide.js` then `node scripts/stamp-updated-dates.js`; do not edit the generated pages. Then manually verify against the review checklist in `marin-skills/marin-app-builder/SKILL.md`: metadata placeholders replaced, nav includes About and Updates, accessibility basics, no invented components.

## References

- `marin-ui` — shared components, tokens, app shell: https://github.com/marincountygov/marin-ui
- `marin-digital-standards` — accessibility, content, brand, and product-design requirements: https://github.com/marincountygov/marin-digital-standards
- `marin-skills` — AI workflows for building and reviewing Marin applications, including `marin-app-builder` and `app-maintainer`: https://github.com/marincountygov/marin-skills
- `marin-os` — the MarinOS app directory this project is registered in: https://github.com/marincountygov/marin-os
