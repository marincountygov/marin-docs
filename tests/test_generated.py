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
PAGES = sorted(p for p in [ROOT / "index.html", *(ROOT / "guide").rglob("*.html"), *(ROOT / "sop").rglob("*.html")])
UPDATED = re.compile(r'<p class="doc-updated">Updated [^<]*</p>')


def attr_values(html: str, name: str):
    return re.findall(rf'\b{name}="([^"]*)"', html)


class PageTests(unittest.TestCase):
    def test_pages_found(self):
        self.assertGreaterEqual(len(PAGES), 20)

    def test_generated_guide_is_current(self):
        guide = Path("guide/personnel-management-regulations")
        with tempfile.TemporaryDirectory() as temp:
            copy = Path(temp) / "repo"
            (copy / "scripts").mkdir(parents=True)
            shutil.copy(ROOT / "scripts/build-pmr-guide.js", copy / "scripts/build-pmr-guide.js")
            shutil.copytree(ROOT / guide, copy / guide)
            shutil.copytree(ROOT / "guide/public-engagement-plan", copy / "guide/public-engagement-plan", dirs_exist_ok=True)
            for extra in ("guide/guides.json", "guide/styles.css"):
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
