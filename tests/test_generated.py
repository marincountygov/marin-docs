#!/usr/bin/env python3
"""Checks on the pages in this repo that are generated or hand-built, without a browser. Needs Node.

1. The Personnel Management Regulations pages are current: the generator, run in a copy, makes the same pages
   (the "Updated" stamp aside, which a separate script sets from the edit history).
2. No page was left with the generator's placeholder date ("Updated recently").
3. Every page has a language, a title, exactly one h1, and unique ids.
4. Every relative link and file reference in the guide, SOP and home pages lands on a file that exists, and every
   same-page #link has a target.
5. Each SOP page's JSON-LD parses and names its type and title.

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
PAGES = sorted(p for p in [ROOT / "index.html", *(ROOT / "guides").rglob("*.html"), *(ROOT / "sop").rglob("*.html")])
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
