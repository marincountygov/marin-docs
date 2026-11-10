#!/usr/bin/env python3
"""Checks on the pages in this repo that are generated or hand-built, without a browser. Needs Node.

1. The Personnel Management Regulations pages are current: the generator, run in a copy, makes the same pages
   (the "Updated" stamp aside, which a separate script sets from the edit history).
2. No page was left with the generator's placeholder date ("Updated recently").
3. Every page has a language, a title, exactly one h1, and unique ids.
4. Every relative link and file reference in the guide, SOP and home pages lands on a file that exists, and every
   same-page #link has a target.
5. Each SOP page's JSON-LD parses and names its type and title.
6. Organization pages carry no localhost links, and their tabs and record lists are complete.
7. The Budget, Service area and Program pages are in the same checks as the others (language, title, one h1, links).

Run: python3 tests/test_generated.py
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
PAGES = sorted(p for p in [ROOT / "index.html", *(ROOT / "guides").rglob("*.html"), *(ROOT / "sop").rglob("*.html"), *(ROOT / "organization").glob("*.html"), *(ROOT / "budget").glob("*.html"), *(ROOT / "budget" / "funds").glob("*.html"), *(ROOT / "budget" / "fy2025-26").glob("*.html"), *(ROOT / "capital").glob("*.html"), *(ROOT / "capital" / "projects").glob("*.html"), *(ROOT / "service-areas").glob("*.html"), *(ROOT / "programs").glob("*.html")])
UPDATED = re.compile(r'<p class="doc-updated">Updated [^<]*</p>')


def attr_values(html: str, name: str):
    return re.findall(rf'\b{name}="([^"]*)"', html)


class PageTests(unittest.TestCase):
    def test_pages_found(self):
        self.assertGreaterEqual(len(PAGES), 20)

    def test_generated_guide_is_current(self):
        guide = Path("guides/personnel-management-regulations")
        with tempfile.TemporaryDirectory() as temp:
            copy = Path(temp) / "repo"
            (copy / "scripts").mkdir(parents=True)
            shutil.copy(ROOT / "scripts/build-pmr-guide.js", copy / "scripts/build-pmr-guide.js")
            shutil.copytree(ROOT / guide, copy / guide)
            shutil.copytree(ROOT / "guides/public-engagement-plan", copy / "guides/public-engagement-plan", dirs_exist_ok=True)
            for extra in ("guides/guides.json", "guides/styles.css"):
                (copy / extra).parent.mkdir(parents=True, exist_ok=True)
                if (ROOT / extra).exists():
                    shutil.copy(ROOT / extra, copy / extra)
            result = subprocess.run(["node", "scripts/build-pmr-guide.js"], cwd=copy, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            stale = []
            for page in sorted((ROOT / guide).glob("*.html")):
                made = copy / guide / page.name
                if UPDATED.sub("", page.read_text(encoding="utf-8")) != UPDATED.sub("", made.read_text(encoding="utf-8")):
                    stale.append(page.name)
            self.assertEqual(stale, [], f"These pages differ from what the generator makes; run node scripts/build-pmr-guide.js then node scripts/stamp-updated-dates.js: {stale}")

    def test_guides_are_current(self):
        """Every guide built from Markdown matches what the generator makes from its source and config."""
        guides = sorted(p.parent.parent.name for p in (ROOT / "guides").glob("*/data/guide.json"))
        self.assertIn("engage-marin", guides)
        with tempfile.TemporaryDirectory() as temp:
            copy = Path(temp) / "repo"
            (copy / "scripts").mkdir(parents=True)
            for script in ("build-guide.js", "guide-schema.js"):
                shutil.copy(ROOT / "scripts" / script, copy / "scripts" / script)
            shutil.copytree(ROOT / "guides", copy / "guides")
            result = subprocess.run(["node", "scripts/build-guide.js"], cwd=copy, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            stale = []
            for slug in guides:
                guide = Path("guides") / slug
                for page in sorted([*(ROOT / guide).glob("*.html"), ROOT / guide / "structured-data.json"]):
                    made = copy / guide / page.name
                    if UPDATED.sub("", page.read_text(encoding="utf-8")) != UPDATED.sub("", made.read_text(encoding="utf-8")):
                        stale.append(f"{slug}/{page.name}")
            self.assertEqual(stale, [], f"These files differ from what the generator makes; run node scripts/build-guide.js then node scripts/stamp-updated-dates.js: {stale}")

    def test_a_minimal_guide_builds_from_markdown_and_a_small_config(self):
        """A second guide needs only Markdown and a small config: no lifecycle, limits, terms or links."""
        with tempfile.TemporaryDirectory() as temp:
            copy = Path(temp) / "repo"
            (copy / "scripts").mkdir(parents=True)
            for script in ("build-guide.js", "guide-schema.js"):
                shutil.copy(ROOT / "scripts" / script, copy / "scripts" / script)
            shutil.copytree(ROOT / "guides/schema", copy / "guides/schema")
            guide = copy / "guides/handbook"
            (guide / "source").mkdir(parents=True)
            (guide / "data").mkdir()
            (guide / "source/handbook.md").write_text(
                "# Handbook\n\n## Welcome\n\nThis handbook explains how we work.\n\n## Meetings\n\nWe meet weekly.\n\n### Agenda\n\n- Updates\n- Decisions\n\n## Contacts\n\nAsk your supervisor.\n",
                encoding="utf-8")
            (guide / "data/guide.json").write_text(json.dumps({
                "slug": "handbook", "name": "Team Handbook", "description": "How the team works.", "audience": "County of Marin staff",
                "publisher": "County of Marin", "baseUrl": "https://data.marincounty.gov/guides/handbook", "source": "../source/handbook.md",
                "indexPage": "Welcome", "titles": {"Welcome": "Team Handbook"},
                "groups": [{"name": "Overview", "pages": ["Team Handbook"]}, {"name": "Working together", "pages": ["Meetings", "Contacts"]}]}), encoding="utf-8")
            result = subprocess.run(["node", "scripts/build-guide.js", "handbook"], cwd=copy, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(sorted(p.name for p in guide.glob("*.html")), ["contacts.html", "index.html", "meetings.html"])
            home = (guide / "index.html").read_text(encoding="utf-8")
            self.assertIn("Working together", home)
            self.assertIn('href="meetings.html"', home)
            self.assertNotIn("guide-lifecycle", home, "No lifecycle bar when the guide has no lifecycle")
            data = json.loads((guide / "structured-data.json").read_text(encoding="utf-8"))
            self.assertEqual(len(data["@graph"][0]["hasPart"]), 3)
            # A bad config is refused with a plain message.
            (guide / "data/guide.json").write_text(json.dumps({"slug": "handbook"}), encoding="utf-8")
            bad = subprocess.run(["node", "scripts/build-guide.js", "handbook"], cwd=copy, capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('is missing "name"', bad.stderr)

    def test_guide_configs_match_the_schema(self):
        """Each guide's data/guide.json is valid against guides/schema/guide.schema.json, and a bad one is refused."""
        for config in sorted((ROOT / "guides").glob("*/data/guide.json")):
            result = subprocess.run(["node", "-e", """
              const { validate } = require('./scripts/guide-schema.js');
              const schema = require('./guides/schema/guide.schema.json');
              const data = require(process.argv[1]);
              const errors = validate(schema, data);
              const bad = validate(schema, { ...data, unexpected: true });
              console.log(JSON.stringify({ errors, refused: bad.length > 0 }));
            """, str(config)], cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            out = json.loads(result.stdout)
            self.assertEqual(out["errors"], [], f"{config.parent.parent.name}: {out['errors']}")
            self.assertTrue(out["refused"], "an unknown setting must be refused")

    def test_engage_marin_structured_data(self):
        data = json.loads((ROOT / "guides/engage-marin/structured-data.json").read_text(encoding="utf-8"))
        graph = {node.get("@type"): node for node in data["@graph"]}
        guide = graph["CreativeWork"]
        pages = sorted((ROOT / "guides/engage-marin").glob("*.html"))
        self.assertEqual(len(guide["hasPart"]), len(pages), "every page is listed in the guide's hasPart")
        steps = guide["mainEntity"]["step"]
        self.assertEqual([s["name"] for s in steps], ["Plan", "Create", "Partner", "Launch", "Monitor", "Organize", "Update", "Close"])
        for page in pages:
            html = page.read_text(encoding="utf-8")
            blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            self.assertEqual(len(blocks), 1, f"{page.name}: one JSON-LD block")
            self.assertEqual(json.loads(blocks[0])["@type"], "TechArticle", f"{page.name}: JSON-LD parses")

    def test_no_placeholder_dates(self):
        left = [str(p.relative_to(ROOT)) for p in PAGES if "Updated recently" in p.read_text(encoding="utf-8")]
        self.assertEqual(left, [], f"Run node scripts/stamp-updated-dates.js: {left}")

    def test_organization_pages_have_no_local_links(self):
        # A page built with --local points at localhost; rebuild without it before committing.
        local = [p.name for d in ("organization", "service-areas", "programs") for p in (ROOT / d).glob("*.html") if "localhost" in p.read_text(encoding="utf-8")]
        self.assertEqual(local, [], f"Rebuild with: node scripts/build-organization.js (no --local): {local}")

    def test_organization_tabs_are_complete(self):
        # Every tab link has a section, and every record list says where its data is and what to match.
        for page in (ROOT / "organization").glob("*.html"):
            html = page.read_text(encoding="utf-8")
            if page.name == "index.html":
                continue
            self.assertIn('id="app-nav"', html, f"{page.name}: no tab bar")
            sections = set(re.findall(r'data-tab-section="([^"]+)"', html))
            for target in re.findall(r'<nav id="app-nav"[^>]*>(.*?)</nav>', html)[0].split('href="#')[1:]:
                self.assertIn(target.split('"')[0], sections, f"{page.name}: tab link without a section")
            for tag in re.findall(r"<div data-key-numbers [^>]*>", html):
                self.assertIn("data-src=", tag, f"{page.name}: key numbers without data-src")
                self.assertTrue("data-fields=" in tag or "data-compute=" in tag, f"{page.name}: key numbers without data-fields or data-compute")
            for tag in re.findall(r"<div data-chart [^>]*>", html):
                # A chart reads a file (data-src) or amounts the page holds (data-inline, a block that must exist).
                self.assertTrue("data-src=" in tag or "data-inline=" in tag, f"{page.name}: chart without data-src or data-inline")
                inline = re.search(r'data-inline="([^"]+)"', tag)
                if inline:
                    self.assertIn(f'id="{inline.group(1)}"', html, f"{page.name}: chart data block missing")
                for needed in ("data-chart-title", "data-chart-lib"):
                    self.assertIn(needed + "=", tag, f"{page.name}: chart without {needed}")
                lib = re.search(r'data-chart-lib="([^"]+)"', tag).group(1)
                self.assertTrue((page.parent / lib).resolve().is_file(), f"{page.name}: chart library {lib} is missing")
            for tag in re.findall(r"<div data-(?:record-list|key-numbers|chart) [^>]*>", html):
                # a match field and its value go together
                self.assertEqual("data-match=" in tag, "data-value=" in tag, f"{page.name}: data-match and data-value")
            for tag in re.findall(r"<div data-record-list [^>]*>", html):
                for needed in ("data-src", "data-title"):
                    self.assertIn(needed + "=", tag, f"{page.name}: record list without {needed}")

    def test_budget_pages_show_the_book_and_its_source(self):
        # A department's Budget tab, and the Budget section's tables, cite the book's pages and link to it.
        for rel in ("organization/cda.html", "budget/index.html", "budget/service-areas.html", "budget/departments.html"):
            text = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn("budget-table", text, rel)
            self.assertRegex(text, r"Source</h[23]><ul><li>[^<]*pages? <a href=\"https://assets\.marincounty\.gov/[^\"]+#page=\d+\">", rel)
        cda = (ROOT / "organization/cda.html").read_text(encoding="utf-8")
        self.assertIn('data-tab-section="budget"', cda)
        self.assertIn('<a href="#budget">Budget</a>', cda)
        # Planned years are not shown.
        self.assertNotIn("2027-28", cda)

    def test_organization_pages_have_dashboard_about_and_actions(self):
        text = (ROOT / "organization/cda.html").read_text(encoding="utf-8")
        nav = re.search(r'<nav id="app-nav"[^>]*>(.*?)</nav>', text, re.S).group(1)
        labels = re.findall(r">([^<]+)</a>", nav)
        # Dashboard first, then About; Reach before Links.
        self.assertEqual(labels[:2], ["Dashboard", "About"])
        self.assertLess(labels.index("Reach"), labels.index("Links"))
        # Campaigns (the Reach projects the agency is in) are a sub-tab of Reach, between Home and Stats, each
        # linking to Reach filtered to that project. They are not a tab of their own.
        # The link under Mentions opens Marin Mentions on the past 60 days, filtered to the organization.
        self.assertRegex(text, r'href="https://[^"]*marin-mentions/\?time=60d&amp;monitors=[^"]+">[^<]* Mentions</a>')
        self.assertNotIn("Campaigns", labels)
        reach = re.search(r'aria-label="Reach sections">(.*?)</nav>', text, re.S).group(1)
        self.assertEqual(re.findall(r">([^<]+)</a>", reach), ["Home", "Campaigns", "Stats"])
        self.assertRegex(text, r'data-group="project" data-group-link="[^"]*\?project=\{value\}"')
        self.assertNotIn("Overview", labels)
        # The default view is the Dashboard, and it links to the other tabs for more.
        self.assertLess(text.index('data-tab-section="dashboard"'), text.index('data-tab-section="about"'))
        dash = text[text.index('data-tab-section="dashboard"'):text.index('data-tab-section="about"')]
        self.assertIn('<p class="org-dash__more"><a href="#budget">All Budget</a></p>', dash)
        self.assertNotIn("More in", dash)
        # The Mentions card links out to Marin Mentions (the past 60 days, this organization); the others link to their tab.
        mentions = re.search(r'id="dash-mentions">.*?</section>', dash, re.S).group(0)
        self.assertRegex(mentions, r'<p class="org-dash__more"><a href="https://[^"]*marin-mentions/\?time=60d&amp;monitors=[^"]+">[^<]* Mentions</a></p>')
        self.assertNotIn('href="#mentions"', mentions)
        # Divisions and Programs are tabs only; Mentions, Reach and Links follow the Budget.
        self.assertIn('id="dash-divisions"', dash)
        self.assertIn('id="dash-programs"', dash)
        self.assertNotIn('id="dash-links"', dash)
        self.assertIn("data-timeframe=", dash)
        self.assertNotIn('id="dash-about"', dash)
        # The buttons sit below the tabs and follow the open tab: each item names the tabs it is for.
        self.assertLess(text.index('<nav id="app-nav"'), text.index('class="doc-actions" data-tabs'))
        self.assertRegex(text, r'data-download-csv="programs" data-for-tabs="programs"')
        self.assertRegex(text, r'data-download-csv="budget" data-for-tabs="budget"')
        self.assertNotIn('data-for-tabs="dashboard', text)
        for tab in ("programs", "budget", "about", "data"):
            self.assertIn(f'id="page-data-{tab}"', text)
        # JSON is offered where the page carries its data.
        self.assertIn("data-copy-json", text)
        self.assertIn("data-download-json", text)
        self.assertNotIn("data-copy-json", (ROOT / "organization/index.html").read_text(encoding="utf-8"))
        # Copy, Link and Download are on organization, service area and budget pages.
        for rel in ("organization/cda.html", "organization/index.html", "service-areas/index.html", "service-areas/public-safety.html",
                    "budget/index.html", "budget/funds.html", "budget/service-areas.html", "budget/departments.html"):
            page = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn('data-formats-for="', page, rel)
            self.assertIn('data-action="share"', page, rel)
            self.assertIn('data-download-format="markdown"', page, rel)

    def test_phone_numbers_are_tel_links(self):
        for page in (ROOT / "organization").glob("*.html"):
            text = page.read_text(encoding="utf-8")
            for number in re.findall(r"<dt>Telephone</dt><dd>(.*?)</dd>", text):
                if re.search(r"\d{3}\D*\d{3}\D*\d{4}", number):
                    self.assertRegex(number, r'^<a href="tel:\+1\d{10}">', page.name)
                else:
                    self.assertNotIn("tel:", number, page.name)

    def test_budget_charts_match_their_tables(self):
        money = lambda t: int(t.replace("$", "").replace(",", "").replace("\u2212", "-").replace("+", ""))
        text = (ROOT / "organization/cda.html").read_text(encoding="utf-8")
        specs = {i: json.loads(raw) for i, raw in re.findall(r'<script type="application/json" id="([^"]+-data)">(.*?)</script>', text, re.S)}
        for inline in re.findall(r'data-inline="([^"]+)"', text):
            self.assertIn(inline, specs)
        table = re.search(r"<caption>Revenues and expenditures by type</caption>.*?</table>", text, re.S).group(0)
        rows = {}
        for label, a, b in re.findall(r'<th scope="row">([^<]+)</th><td class="budget-table__num">([^<]+)</td><td class="budget-table__num">([^<]+)</td>', table):
            rows[label] = (money(a), money(b))
        types = specs["budget-chart-types-data"]
        for label, a, b in zip(types["labels"], types["series"][0]["values"], types["series"][1]["values"]):
            self.assertEqual(rows[label], (a, b), label)
        totals = {s["name"]: s["values"] for s in specs["budget-chart-totals-data"]["series"]}
        self.assertEqual(totals["Expenditures"], list(rows["Total expenditures"]))
        self.assertEqual(totals["Revenues"], list(rows["Total revenues"]))
        self.assertEqual(totals["Net County cost"], list(rows["Net County cost"]))
        # Every chart says its result in words, and uses whole dollars.
        for key, spec in specs.items():
            self.assertEqual(spec["format"], "currency", key)
            self.assertTrue(spec.get("summary"), key)


    def test_csv_downloads_where_the_page_holds_a_table(self):
        # Each CSV item has its rows in the page, a header row first and the same number of cells in every row.
        for rel, count in (("organization/cda.html", 3), ("organization/hhs.html", 3), ("budget/index.html", 1), ("budget/fy2025-26/index.html", 1), ("budget/departments.html", 1), ("budget/service-areas.html", 1),
                           ("budget/funds.html", 1), ("service-areas/public-safety.html", 2), ("organization/index.html", 1), ("service-areas/index.html", 1),
                           ("programs/cda-building-and-safety.html", 1), ("budget/funds/1000-general-fund.html", 2)):
            text = (ROOT / rel).read_text(encoding="utf-8")
            # Every table has its own Copy and Download buttons and a CSV read from the table; the page's own CSV items are counted apart.
            blocks = re.findall(r'<div class="table-block" id="([^"]+)">', text)
            for block in blocks:
                self.assertIn(f'data-download-csv="{block}"', text, f"{rel}: {block} has no CSV button")
                self.assertIn(f'data-formats-for="#{block} .table-scroll"', text, f"{rel}: {block} has no Copy button")
            ids = [i for i in re.findall(r'data-download-csv="([^"]+)"', text) if i not in blocks]
            self.assertEqual(len(ids), count, rel)
            for csv_id in ids + blocks:
                rows = json.loads(re.search(rf'<script type="application/json" id="csv-{csv_id}">(.*?)</script>', text, re.S).group(1))
                self.assertGreater(len(rows), 1, f"{rel}: {csv_id}")
                self.assertEqual({len(r) for r in rows}, {len(rows[0])}, f"{rel}: {csv_id} rows differ in width")
        # A program the book has no figures for has no table, so no CSV.
        self.assertNotIn("data-download-csv", (ROOT / "programs/cda-planning-administration.html").read_text(encoding="utf-8"))
        # A page with no table offers no CSV.
        self.assertNotIn("data-download-csv", (ROOT / "organization/cda-planning.html").read_text(encoding="utf-8"))

    def test_service_areas_and_programs_have_budgets(self):
        area = (ROOT / "service-areas/community-development-and-public-works.html").read_text(encoding="utf-8")
        nav = re.search(r'<nav id="app-nav"[^>]*>(.*?)</nav>', area, re.S).group(1)
        self.assertEqual(re.findall(r">([^<]+)</a>", nav), ["Dashboard", "About", "Programs", "Budget", "Data", "Insights"])
        self.assertLess(area.index('data-tab-section="dashboard"'), area.index('data-tab-section="about"'))
        self.assertIn('<a href="#budget">All Budget</a></p>', area[area.index('data-tab-section="dashboard"'):area.index('data-tab-section="about"')])
        self.assertIn('data-tab-section="budget"', area)
        # A program card is its title and description only; the figures are on the program's page.
        cards = re.search(r'id="programs".*?id="budget"', area, re.S).group(0)
        self.assertNotIn("Administered by", cards)
        self.assertNotIn("expenditures</p>", cards)
        # A program's own page has a Budget tab with its fund groups, chart and the book's page.
        program = (ROOT / "programs/cda-building-and-safety.html").read_text(encoding="utf-8")
        self.assertIn('<a href="#budget">Budget</a>', program)
        self.assertIn("program-chart-groups-data", program)
        self.assertRegex(program, r"Source</h3><ul><li>[^<]*pages? <a href=\"https://assets\.marincounty\.gov/")
        # Programs open on a Dashboard, then About, like organizations.
        nav = re.search(r'<nav id="app-nav"[^>]*>(.*?)</nav>', program, re.S).group(1)
        self.assertEqual(re.findall(r">([^<]+)</a>", nav), ["Dashboard", "About", "Budget", "Data", "Insights"])
        self.assertLess(program.index('data-tab-section="dashboard"'), program.index('data-tab-section="about"'))
        # Data files are listed under a Source heading, one item each.
        for rel in ("service-areas/public-safety.html", "programs/cda-building-and-safety.html", "budget/funds.html", "budget/departments.html"):
            self.assertRegex((ROOT / rel).read_text(encoding="utf-8"), r'<h2 id="source">Source</h2><ul><li>', rel)
        # A program the book has no row for has no Budget tab.
        self.assertNotIn('data-tab-section="budget"', (ROOT / "programs/cda-planning-administration.html").read_text(encoding="utf-8"))

    def test_programs_are_listed_a_to_z(self):
        # Programs on a service area page and an organization's Programs tab run A to Z by name.
        for rel in ("service-areas/public-safety.html", "organization/cda.html", "organization/hhs.html"):
            text = (ROOT / rel).read_text(encoding="utf-8")
            section = re.search(r'id="programs".*?</ul>', text, re.S).group(0)
            names = re.findall(r'<h3 class="mm-card__title"><a href="[^"]+">([^<]+)</a>', section)
            self.assertGreater(len(names), 3, rel)
            self.assertEqual(names, sorted(names, key=str.casefold), rel)

    def test_every_organization_service_area_program_and_budget_page_has_the_buttons(self):
        for d in ("organization", "service-areas", "programs", "budget", "budget/funds"):
            for page in (ROOT / d).glob("*.html"):
                text = page.read_text(encoding="utf-8")
                self.assertIn('class="doc-actions"', text, page.name)
                self.assertIn('data-action="share"', text, page.name)

    def test_capital_pages_match_their_data(self):
        data = json.loads((ROOT / "capital/data/cip-display.json").read_text(encoding="utf-8"))
        projects = data["projects"]
        self.assertEqual(len(list((ROOT / "capital/projects").glob("*.html"))), len(projects))
        # Every project row adds up to its own printed total.
        for p in projects:
            years = sum(p["byYear"].values())
            self.assertEqual(p["priorApprovals"] + years, p["totalFunding"], p["name"])
            self.assertEqual(p["totalFunding"] + p["additionalFundsNeeded"], p["costEstimate"], p["name"])
        # The projects page is a tool: a card and a table row for every project, the filters, and the stats the script keeps current.
        tool = (ROOT / "capital/projects.html").read_text(encoding="utf-8")
        self.assertEqual(len(re.findall(r'<li class="app-card mm-card" data-project=', tool)), len(projects))
        self.assertEqual(len(re.findall(r'<tr data-project=', tool)), len(projects))
        for facet in ("category", "subcategory", "status", "year", "size", "gap"):
            self.assertIn(f'id="facet-{facet}"', tool)
        for needle in ('id="active-filters"', 'id="selection-kpis"', 'data-view="table"', 'data-sort="cost"', 'src="projects.js?v='):
            self.assertIn(needle, tool)
        # The landing page shows the book's all-categories total.
        all_total = next(c for c in data["categoryTotals"] if c["label"] == "All Project Categories Total")["total"]
        index = (ROOT / "capital/index.html").read_text(encoding="utf-8")
        self.assertIn(f"${all_total:,}", index)
        # A fund for capital projects links to the plan; the General Fund does not.
        self.assertIn("capital/index.html", (ROOT / "budget/funds/1420-countywide-capital-projects-fund.html").read_text(encoding="utf-8"))
        self.assertNotIn("capital/index.html", (ROOT / "budget/funds/1000-general-fund.html").read_text(encoding="utf-8"))

    def test_budget_2025_pages_match_the_book_and_its_checks(self):
        base = ROOT / "budget/fy2025-26"
        data = json.loads((base / "data/schedules.json").read_text(encoding="utf-8"))
        schedules = {s["number"]: s for s in data["schedules"]}
        self.assertEqual(sorted(schedules), list(range(1, 16)))
        for n in schedules:
            self.assertTrue((base / f"schedule-{n}.html").exists(), n)
        for name in ("index", "road-fund", "personnel", "property-tax-trends"):
            self.assertTrue((base / f"{name}.html").exists(), name)

        def rows(n):
            return [x for x in schedules[n]["items"] if "heading" not in x]
        # The book's own totals: financing sources equal financing uses, and the schedule rows add up to them.
        total = next(x for x in rows(1) if x["label"] == "Total All Funds")
        self.assertEqual(total["values"][3], total["values"][6])
        self.assertEqual(sum(total["values"][:3]), total["values"][3])
        governmental = next(x for x in rows(1) if x["label"] == "Total Governmental Funds")
        groups = [x for x in rows(2) if x["code"] is None and x["label"] in ("Total General Fund", "Total Special Revenue Funds", "Total Capital Project Funds", "Total Debt Service Funds")]
        self.assertEqual(len(groups), 4)
        for k in range(7):
            self.assertEqual(sum(g["values"][k] for g in groups), governmental["values"][k], k)
        # Every fund row: sources add up and equal uses.
        for x in rows(2):
            v = x["values"]
            self.assertEqual(v[0] + v[1] + v[2], v[3], x["label"])
            self.assertEqual(v[3], v[6], x["label"])
        # The book's printed headline numbers are on the overview, and the buttons are on every page.
        index = (base / "index.html").read_text(encoding="utf-8")
        self.assertIn("$1068.0M", index)  # Schedule 7, subtotal financing uses, adopted
        self.assertIn("$488.4M", index)  # Schedule 2, General Fund financing uses
        for page in sorted(base.glob("*.html")):
            text = page.read_text(encoding="utf-8")
            self.assertIn('data-download-csv', text, page.name)
            self.assertIn("page-data.js?v=", text, page.name)
        # The tool on the home page: a year dropdown, a card and a row for every Schedule 8 unit line, the filters, the tabs, and the notes from the data.
        lines = (base / "index.html").read_text(encoding="utf-8")
        unit_lines = [x for x in rows(8) if x["code"]]
        self.assertEqual(len(re.findall(r'<li class="app-card mm-card" data-line=', lines)), len(unit_lines))
        self.assertEqual(len(re.findall(r'<tr data-line=', lines)), len(unit_lines))
        for needle in ('id="facet-function"', 'id="facet-unit"', 'id="stats-toggle"', 'id="notes-toggle"', 'id="line-notes"', 'id="book-filter"', 'id="column-filter"', 'budget/tool.js?v='):
            self.assertIn(needle, lines)
        notes = json.loads((base / "data/notes.json").read_text(encoding="utf-8"))
        for text in notes["notes"]:
            self.assertIn(text, lines)
        self.assertEqual(len(notes["totalsThatDifferFromTheirParts"]), lines.count('<th scope="row">FY 20'))
        # A card's title stays in the tool: it applies that line as a filter and opens Stats.
        self.assertRegex(lines, r'<h3 class="mm-card__title"><a href="\?unit=[^"]+&amp;tab=stats">')
        # Schedule 9 lists each budget unit once, though the book prints it for each function.
        nine = (base / "schedule-9.html").read_text(encoding="utf-8")
        self.assertEqual(len(re.findall(r'<h2 id="s\d+-100-', nine)), 1)
        # The Budget page links to the book's pages, and the JSON-LD loads as schemaGov entities.
        self.assertIn("fy2025-26/index.html", (ROOT / "budget/index.html").read_text(encoding="utf-8"))
        budgets = json.loads((base / "data/budgets-2025-26.jsonld").read_text(encoding="utf-8"))["@graph"]
        self.assertEqual([b["budgetPhase"] for b in budgets], ["executed", "adjusted", "proposed", "approved"])

    def test_budget_and_capital_sections_carry_the_test_banner_and_nothing_else_does(self):
        text = "TEST: This is a design test. Data shown has not been fully reviewed and is for test use only."
        for rel in ("budget/index.html", "budget/fy2025-26/index.html", "budget/funds/1000-general-fund.html", "budget/fy2025-26/schedule-4.html", "budget/departments.html", "capital/index.html", "capital/projects.html"):
            page = (ROOT / rel).read_text(encoding="utf-8")
            self.assertIn(f'<div class="app-test-banner" role="note">{text}</div>', page, rel)
            # Directly under the header navigation, above the page content.
            self.assertLess(page.index("</header>"), page.index("app-test-banner"), rel)
            self.assertLess(page.index("app-test-banner"), page.index('<main id="main"'), rel)
        self.assertNotIn("app-test-banner", (ROOT / "organization/sheriff.html").read_text(encoding="utf-8"))

    def test_budget_page_opens_with_the_countywide_overview(self):
        text = (ROOT / "budget/index.html").read_text(encoding="utf-8")
        # The County as a whole is on the Stats tab, after the selection's own stats.
        self.assertLess(text.index('id="selection-charts"'), text.index('id="overview"'))
        self.assertIn("$902.6M", text)
        self.assertIn("$855.6M", text)
        self.assertIn("4.2%", text)
        # The overview's pies and table come from the same figures, and cite pages 20 and 21 of the book.
        self.assertIn("chart-county-expenditures-data", text)
        self.assertRegex(text, r"pages <a [^>]*#page=22\">20</a>, <a [^>]*#page=23\">21</a>")

    def test_a_division_without_figures_shows_no_budget(self):
        # The book budgets departments (and Health and Human Services' divisions); other divisions show no Budget at all.
        text = (ROOT / "organization/cda-environmental-health-services.html").read_text(encoding="utf-8")
        self.assertNotIn('data-tab-section="budget"', text)
        self.assertNotIn('id="dash-budget"', text)
        self.assertNotIn("budget book gives figures", text)

    def test_insights_is_the_last_tab_and_holds_the_pages_data(self):
        for rel, sections in (("organization/county-executive.html", ["about", "programs", "budget"]), ("service-areas/public-safety.html", ["about", "programs", "budget"]),
                              ("programs/cda-building-and-safety.html", ["about", "budget"]), ("organization/cda-environmental-health-services.html", ["about"])):
            text = (ROOT / rel).read_text(encoding="utf-8")
            nav = re.search(r'<nav id="app-nav"[^>]*>(.*?)</nav>', text, re.S).group(1)
            labels = re.findall(r">([^<]+)</a>", nav)
            self.assertEqual(labels[-2:], ["Data", "Insights"], rel)
            self.assertIn('data-tab-section="insights"', text, rel)
            for name in sections:
                block = re.search(rf'<script type="application/json" id="insights-data-{name}">(.*?)</script>', text, re.S)
                self.assertIsNotNone(block, f"{rel}: {name}")
                self.assertTrue(json.loads(block.group(1)), f"{rel}: {name} has data")
            # It builds a prompt and copies it; it names no AI product and calls no AI service.
            insights = text[text.index('data-tab-section="insights"'):]
            for name in ("Claude", "ChatGPT", "Copilot", "Gemini", "OpenAI", "Anthropic"):
                self.assertNotIn(name, insights, rel)
            self.assertIn("data-insights-copy", text, rel)
        # Live sources are asked for only where the organization has them.
        self.assertIn("data-insights-live", (ROOT / "organization/county-executive.html").read_text(encoding="utf-8"))
        self.assertNotIn("data-insights-live", (ROOT / "service-areas/public-safety.html").read_text(encoding="utf-8"))

    def test_every_fund_has_a_page(self):
        funds = (ROOT / "budget/funds.html").read_text(encoding="utf-8")
        cards = funds[funds.index('<ul class="search-results-list"'):funds.index("</ul>", funds.index('<ul class="search-results-list"'))]
        links = re.findall(r'<h3 class="mm-card__title"><a href="\./funds/([^"]+\.html)">', cards)
        self.assertEqual(len(links), 28)
        for link in links:
            page = (ROOT / "budget/funds" / link)
            self.assertTrue(page.exists(), link)
            text = page.read_text(encoding="utf-8")
            labels = re.findall(r">([^<]+)</a>", re.search(r'<nav id="app-nav"[^>]*>(.*?)</nav>', text, re.S).group(1))
            self.assertEqual([l for l in labels if l not in ("Budget",)], ["Dashboard", "About", "Data", "Insights"], link)
        # Only the General Fund has figures, from the program rows that name it; the others say what the data says.
        general = (ROOT / "budget/funds/1000-general-fund.html").read_text(encoding="utf-8")
        self.assertIn('data-tab-section="budget"', general)
        self.assertIn("fund-chart-departments-data", general)
        self.assertRegex(general, r"Source</h3><ul><li>[^<]*pages? <a href=")
        # The others have a Budget tab only for what the FY 2025-26 Final Budget prints for the fund number: no departments table.
        building = (ROOT / "budget/funds/2080-building-inspection-fund.html").read_text(encoding="utf-8")
        self.assertIn('id="budget-fy2025-26"', building)
        self.assertNotIn("fund-chart-departments-data", building)
        # A department with a budget unit in that book shows it on its Budget tab, from the book's own schedules.
        sheriff = (ROOT / "organization/sheriff.html").read_text(encoding="utf-8")
        self.assertIn('id="budget-fy2025-26"', sheriff)
        self.assertIn("Budget unit 260, by function and activity", sheriff)
        # Names are written as the County writes them, and a program's General Fund row links to the page.
        shown = re.sub(r"<script[^>]*>.*?</script>", " ", funds, flags=re.S)  # the JSON is the data as it is
        self.assertIn("HHS Social Services Realignment", shown)
        self.assertNotIn("Hhs ", shown)
        program = (ROOT / "programs/elections-elections.html").read_text(encoding="utf-8")
        self.assertIn('<a href="../budget/funds/1000-general-fund.html">General Fund</a>', program)

    def test_headings_have_no_count_lines_under_them(self):
        # A count of the cards below a heading says nothing a person cannot see.
        cda = (ROOT / "organization/cda.html").read_text(encoding="utf-8")
        divisions = re.search(r'id="divisions".*?</section>', cda, re.S).group(0)
        self.assertNotRegex(divisions, r"\d+ divisions\.")
        self.assertNotRegex((ROOT / "budget/funds.html").read_text(encoding="utf-8"), r">\d+ funds\.<")
        departments = (ROOT / "budget/departments.html").read_text(encoding="utf-8")
        self.assertNotRegex(re.sub(r"<script.*?</script>", " ", departments, flags=re.S), r"\d+ departments\.")
        # The County as a whole is not one of its departments: 23 departments, none named County of Marin.
        self.assertEqual(departments.count("<tr><th scope=\"row\">"), 23)
        self.assertNotIn(">County of Marin</a></th>", departments)
        self.assertNotRegex(cda, r"\d+ programs\.<")

    def test_text_is_clean(self):
        # Text copied from the budget book is cleaned before it is shown (scripts/clean-text.js).
        pages = [p for d in ("organization", "service-areas", "programs", "budget", "budget/funds") for p in (ROOT / d).glob("*.html")]
        for page in pages:
            # The JSON a page offers is the record as the data has it; the cleaning is for what the page shows.
            html = re.sub(r"<script[^>]*>.*?</script>", " ", page.read_text(encoding="utf-8"), flags=re.S)
            text = re.sub(r"<[^>]+>", " ", html)
            self.assertNotIn("DEPARTMENT BUDGET", text, f"{page.name}: budget book heading")
            self.assertNotIn("Tel:", text, f"{page.name}: contact block")
            self.assertIsNone(re.search(r"[a-z]- [A-Za-z]", text), f"{page.name}: word split at a line break")
            self.assertIsNone(re.search(r"[.!?] \.(?:\s|$)", text), f"{page.name}: stray full stop")

    def test_page_basics(self):
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            name = str(page.relative_to(ROOT))
            self.assertRegex(html, r'<html[^>]*\blang="en', f"{name}: lang")
            self.assertRegex(html, r"<title>[^<]+</title>", f"{name}: title")
            if page != ROOT / "index.html":  # the app's home page has no page heading of its own
                self.assertEqual(len(re.findall(r"<h1[\s>]", html)), 1, f"{name}: exactly one h1")
            ids = attr_values(html, "id")
            self.assertEqual(sorted({i for i in ids if ids.count(i) > 1}), [], f"{name}: duplicate ids")

    def test_links_and_files_exist(self):
        for page in PAGES:
            html = page.read_text(encoding="utf-8")
            name = str(page.relative_to(ROOT))
            ids = set(attr_values(html, "id"))
            for ref in attr_values(html, "href") + attr_values(html, "src"):
                if not ref or ref.startswith(("data:", "mailto:", "tel:", "javascript:")) or re.match(r"^[a-z]+://", ref):
                    continue
                parsed = urlparse(ref)
                if not parsed.path:
                    if parsed.fragment:
                        self.assertIn(parsed.fragment, ids, f"{name}: #{parsed.fragment} has no target")
                    continue
                target = (page.parent / unquote(parsed.path)).resolve()
                if str(target).startswith(str(ROOT)) and not parsed.path.startswith("/"):
                    ok = target.is_file() or (target.is_dir() and (target / "index.html").is_file())
                    self.assertTrue(ok, f"{name}: {ref} does not exist")

    def test_sop_json_ld(self):
        for page in sorted((ROOT / "sop").glob("*.html")):
            if page.name == "index.html":
                continue  # the list of SOPs, not an SOP
            html = page.read_text(encoding="utf-8")
            blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            self.assertTrue(blocks, f"{page.name}: JSON-LD block")
            for block in blocks:
                data = json.loads(block)
                node = data if "@type" in data else (data.get("@graph") or [{}])[0]
                self.assertTrue(node.get("@type") and node.get("name"), f"{page.name}: JSON-LD has a type and a name")


if __name__ == "__main__":
    unittest.main()
