#!/usr/bin/env python3
"""Browser test of the three kinds of page in Marin Docs, over HTTP with Playwright.

- A Personnel Management Regulations page: the Interactive and Original text tabs, the Required/Permitted and topic
  filter chips, Share.
- A Standard operating procedure page: the Text and Flow tabs (and the arrow keys), the flow steps that expand, the
  Download menu with its HTML and JSON files, Share.
- A Public engagement plan page: Share and the PDF link.
On every page: no console errors, every button has a name, icon-only buttons have a tooltip, nothing visible runs off
the edge at desktop and phone width.  Needs Playwright for Python with Chromium.  Run: python3 tests/browser_docs.py
"""
from __future__ import annotations

import json
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PMR = "guide/personnel-management-regulations/grievance-procedure.html"
SOP = "sop/airfield-inspection-and-hazard-identification.html"
GUIDE = "guide/public-engagement-plan/glossary.html"
OVERFLOW = """() => [...document.querySelectorAll('body *')]
    .filter((e) => !e.closest('.visually-hidden') && e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('pre, table, .flow-chart, [class*=chart]'))
    .map((e) => e.tagName + '.' + e.className).slice(0, 5)"""


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def common(page, name, url):
    unnamed = page.evaluate("""() => [...document.querySelectorAll('button, [role=button], a.action-button')]
        .filter((b) => !(b.getAttribute('aria-label') || b.textContent || '').trim()).map((b) => b.outerHTML.slice(0, 90))""")
    require(not unnamed, f"{name}: every button has a name: {unnamed}")
    tips = page.evaluate("""() => [...document.querySelectorAll('.action-button')].filter((b) => !(b.textContent || '').trim() && !b.title).length""")
    require(tips == 0, f"{name}: icon-only buttons have a tooltip")
    require(page.locator("[data-action=share]").count() == 1, f"{name}: one Share button")
    page.click("[data-action=share]")
    page.wait_for_function("document.querySelector('.doc-action-status').textContent.trim() !== ''")
    require(page.evaluate("navigator.clipboard.readText()").split("#")[0].rstrip("/") == url.rstrip("/"), f"{name}: Share copies the page link")
    require(not page.evaluate(OVERFLOW), f"{name}: nothing visible runs off the edge at 1200 px: {page.evaluate(OVERFLOW)}")
    page.set_viewport_size({"width": 390, "height": 800})
    page.wait_for_timeout(200)
    require(not page.evaluate(OVERFLOW), f"{name}: nothing visible runs off the edge at 390 px: {page.evaluate(OVERFLOW)}")
    page.set_viewport_size({"width": 1200, "height": 900})


def tabs(page, name, first, second, first_panel, second_panel):
    require(page.get_attribute(first, "aria-selected") == "true" and page.is_visible(first_panel) and page.is_hidden(second_panel), f"{name}: starts on the first tab")
    page.click(second)
    require(page.get_attribute(second, "aria-selected") == "true" and page.get_attribute(first, "aria-selected") == "false", f"{name}: clicking selects the tab")
    require(page.is_visible(second_panel) and page.is_hidden(first_panel), f"{name}: the panels swap")
    page.focus(second)
    page.keyboard.press("ArrowLeft")
    require(page.get_attribute(first, "aria-selected") == "true" and page.is_visible(first_panel), f"{name}: arrow keys move between tabs")


def check_pmr(browser, base):
    context = browser.new_context(viewport={"width": 1200, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda e: problems.append(str(e)))
    page.on("console", lambda m: problems.append(m.text) if m.type == "error" and "404" not in m.text else None)
    url = base + PMR
    page.goto(url)
    page.wait_for_selector(".chip-button")
    tabs(page, "PMR", "#view-tab-interactive", "#view-tab-original", "#interactive-view", "#original-view")

    # Filter chips: Required keeps only required rules; All brings everything back; a topic narrows further.
    total = page.locator("li[data-status]:visible").count()
    require(total > 0, "PMR: rules are listed")
    page.click("[data-status-filter=required]")
    require(page.get_attribute("[data-status-filter=required]", "aria-pressed") == "true" and page.get_attribute("[data-status-filter=all]", "aria-pressed") == "false", "PMR: the pressed chip changes")
    require(page.evaluate("[...document.querySelectorAll('li[data-status]')].filter((i) => !i.hidden).every((i) => i.dataset.status === 'required')"), "PMR: Required shows only required rules")
    required = page.locator("li[data-status]:visible").count()
    require(0 < required < total, f"PMR: Required narrows the list ({required} of {total})")
    page.click("[data-status-filter=permitted]")
    require(page.evaluate("[...document.querySelectorAll('li[data-status]')].filter((i) => !i.hidden).every((i) => i.dataset.status === 'permitted')"), "PMR: Permitted shows only permitted rules")
    page.click("[data-status-filter=all]")
    require(page.locator("li[data-status]:visible").count() == total, "PMR: All restores the list")
    topic = page.locator("[data-category-filter]:not([data-category-filter=all])").first
    topic.click()
    require(page.locator("li[data-status]:visible").count() <= total and page.evaluate("[...document.querySelectorAll('li[data-status]')].filter((i) => !i.hidden).every((i) => i.dataset.category === arguments[0])".replace("arguments[0]", json.dumps(topic.get_attribute("data-category-filter")))), "PMR: a topic narrows the list")
    page.click("[data-category-filter=all]")
    common(page, "PMR", url)
    require(not problems, f"PMR: console or page errors: {problems}")
    context.close()


def check_sop(browser, base):
    context = browser.new_context(viewport={"width": 1200, "height": 900}, permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda e: problems.append(str(e)))
    page.on("console", lambda m: problems.append(m.text) if m.type == "error" and "404" not in m.text else None)
    url = base + SOP
    page.goto(url)
    page.wait_for_selector("#view-tab-text")
    tabs(page, "SOP", "#view-tab-text", "#view-tab-flow", "#text-view", "#flow-view")
    page.click("#view-tab-flow")
    toggles = page.locator("#flow-view [aria-expanded]")
    require(toggles.count() >= 1, "SOP: the flow view has steps that open")
    first = toggles.first
    first.click()
    require(first.get_attribute("aria-expanded") == "true", "SOP: a flow step opens")
    first.click()
    require(first.get_attribute("aria-expanded") == "false", "SOP: and closes again")
    page.click("#view-tab-text")

    # Download menu: HTML and JSON.
    toggle = page.locator(".menu-toggle.action-button")
    require(toggle.get_attribute("aria-expanded") == "false", "SOP: the menu starts closed")
    toggle.click()
    require(toggle.get_attribute("aria-expanded") == "true" and page.locator(".menu-panel:visible a, .menu-panel:visible button").count() == 2, "SOP: the menu opens with two files")
    page.keyboard.press("Escape")
    require(toggle.get_attribute("aria-expanded") == "false", "SOP: Escape closes the menu")
    toggle.click()
    with page.expect_download() as info:
        page.click("[data-action=download-json]")
    data = json.loads(Path(info.value.path()).read_text(encoding="utf-8"))
    require(data.get("@type") or data.get("@graph"), "SOP: the JSON download is the document's JSON-LD")
    require(info.value.suggested_filename.endswith(".json"), "SOP: the JSON file has a .json name")
    html_link = page.locator(".menu-panel a[href$='.html']")
    if toggle.get_attribute("aria-expanded") != "true":
        toggle.click()
    with page.expect_download() as info:
        html_link.click()
    require(info.value.suggested_filename.endswith(".html"), "SOP: the HTML file has a .html name")
    page.keyboard.press("Escape")
    common(page, "SOP", url)
    require(not problems, f"SOP: console or page errors: {problems}")
    context.close()


def check_guide(browser, base):
    context = browser.new_context(viewport={"width": 1200, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda e: problems.append(str(e)))
    page.on("console", lambda m: problems.append(m.text) if m.type == "error" and "404" not in m.text else None)
    url = base + GUIDE
    page.goto(url)
    page.wait_for_selector("[data-action=share]")
    pdf = page.locator("a.action-button[href$='.pdf']")
    require(pdf.count() == 1, "Guide: one PDF link")
    href = pdf.get_attribute("href")
    require((ROOT / "guide/public-engagement-plan" / href).is_file(), f"Guide: the PDF exists ({href})")
    require(pdf.get_attribute("target") == "_blank" and "opens in a new tab" in pdf.get_attribute("aria-label"), "Guide: the PDF link says it opens in a new tab")
    common(page, "Guide", url)
    require(not problems, f"Guide: console or page errors: {problems}")
    context.close()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            check_pmr(browser, base)
            check_sop(browser, base)
            check_guide(browser, base)
        finally:
            browser.close()
            server.shutdown()
    print("Marin Docs browser test (guide, SOP and PMR pages): PASS")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
