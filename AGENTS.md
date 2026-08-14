# Working on this Marin application

## Architecture

This is a static, zero-build MarinOS docs-shell application. It uses the shared `marin-ui` brand bundle (vendored via `marin-ui/scripts/sync-consumer.sh`, version recorded in `BRAND_VERSION`) and follows `marin-digital-standards`. See `marin.yml` for this project's owner, status, and platform versions.

## Before making changes

1. Check `marin-ui/docs/components.md` for an existing pattern before writing new CSS or JS.
2. Prefer existing semantic tokens over raw values.
3. Keep the default view immediately functional — info/how-to content belongs in the About tab, not stacked above or alongside the content.
4. Individual SOP sub-pages (`sop/*.html`) use the `.site-header`/`.site-footer` docs-shell pattern and stay always-visible (no JS-dependent tabs) — see the landing page for where the tab-section pattern applies instead.

## Before finishing

There is no automated check command yet. Manually verify against the review checklist in `marin-skills/marin-app-builder/SKILL.md`: metadata placeholders replaced, nav includes About and Updates, accessibility basics, no invented components.

## References

- `marin-ui` — shared components, tokens, app shell: https://github.com/marincountygov/marin-ui
- `marin-digital-standards` — accessibility, content, brand, and product-design requirements: https://github.com/marincountygov/marin-digital-standards
- `marin-skills` — AI workflows for building and reviewing Marin applications, including `marin-app-builder` and `app-maintainer`: https://github.com/marincountygov/marin-skills
- `marin-os` — the MarinOS app directory this project is registered in: https://github.com/marincountygov/marin-os
