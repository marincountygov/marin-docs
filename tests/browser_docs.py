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
PMR = "guides/personnel-management-regulations/grievance-procedure.html"
SOP = "sop/airfield-inspection-and-hazard-identification.html"
GUIDE = "guides/public-engagement-plan/glossary.html"
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
    require((ROOT / "guides/public-engagement-plan" / href).is_file(), f"Guide: the PDF exists ({href})")
    require(pdf.get_attribute("target") == "_blank" and "opens in a new tab" in pdf.get_attribute("aria-label"), "Guide: the PDF link says it opens in a new tab")
    common(page, "Guide", url)
    require(not problems, f"Guide: console or page errors: {problems}")
    context.close()


def check_engage_marin(browser, base):
    """The Engage Marin pages: a Link button, a Copy menu and a Download menu, all through the shell's helpers."""
    context = browser.new_context(viewport={"width": 1200, "height": 900}, permissions=["clipboard-read", "clipboard-write"], accept_downloads=True)
    page = context.new_page()
    problems = []
    page.on("pageerror", lambda e: problems.append(str(e)))
    url = base + "guides/engage-marin/before-launch.html"
    page.goto(url)
    page.wait_for_selector("[data-action=share]")
    require(page.get_attribute("[data-action=share]", "data-icon") == "link" and page.get_attribute("[data-action=share]", "aria-label") == "Copy link", "Engage Marin: the link button is Copy link with the link icon")
    require("structured-data.json" not in page.inner_text("article.content"), "Engage Marin: no Data section on the page")
    require(page.locator(".doc-actions").evaluate("el => el.previousElementSibling.className") == "doc-updated", "Engage Marin: the actions sit below the date")
    # Icon-only buttons in a standard order (Copy link, Copy, Download), each named and described for assistive technology.
    order = page.evaluate("""() => [...document.querySelectorAll('.doc-actions > .action-group > button, .doc-actions > .menu > button')].map((b) => [b.getAttribute('aria-label'), b.textContent.trim(), b.hasAttribute('title'), b.getAttribute('aria-expanded')])""")
    require([o[0] for o in order] == ["Copy link", "Copy, choose a format", "Download, choose a format"], f"Engage Marin: action order: {order}")
    require(all(o[1] == "" and o[2] for o in order), f"Engage Marin: the action buttons are icon-only with a title: {order}")
    require([o[3] for o in order] == [None, "false", "false"], f"Engage Marin: the menu buttons report open or closed: {order}")
    page.click("button[aria-controls=copy-panel]")
    require(page.get_attribute("button[aria-controls=copy-panel]", "aria-expanded") == "true", "Engage Marin: the open Copy menu says so")
    require(page.locator("#copy-panel button").all_text_contents() == ["Text", "HTML", "Markdown"], "Engage Marin: Copy lists Text, HTML, Markdown")
    page.click("[data-copy-format=text]")
    page.wait_for_function("document.querySelector('.doc-action-status').textContent.includes('Copied rich text')")
    html = page.evaluate("async () => { const [item] = await navigator.clipboard.read(); return await (await item.getType('text/html')).text(); }")
    require(html.startswith("<h1>Before launch</h1>") and "style=" not in html and "class=" not in html and "<strong" not in html, f"Engage Marin: rich copy is clean HTML: {html[:120]}")
    page.click("button[aria-controls=copy-panel]")
    page.click("[data-copy-format=markdown]")
    page.wait_for_function("document.querySelector('.doc-action-status').textContent.includes('Copied Markdown')")
    require(page.evaluate("navigator.clipboard.readText()").startswith("# Before launch\n\nReview the public experience") and "- [ ] We know what we want to learn." in page.evaluate("navigator.clipboard.readText()"), "Engage Marin: Markdown copy")
    page.click("button[aria-controls=download-panel]")
    require(page.locator("#download-panel button").all_text_contents() == ["Text", "HTML", "Markdown", "JSON (this page)", "JSON (whole guide)"], "Engage Marin: Download options")
    for fmt, name in (("text", "before-launch.txt"), ("html", "before-launch.html"), ("markdown", "before-launch.md"), ("json", "before-launch.json"), ("guide-json", "engage-marin-structured-data.json")):
        page.click("button[aria-controls=download-panel]") if page.is_hidden("#download-panel") else None
        with page.expect_download() as info:
            page.click(f"[data-download-format={fmt}]")
        require(info.value.suggested_filename == name, f"Engage Marin: {fmt} downloads as {name}: {info.value.suggested_filename}")
    require(not problems, f"Engage Marin: console or page errors: {problems}")
    context.close()


def check_pager(browser, base):
    """Previous has its arrow to the left of the text, and Next has its arrow to the right."""
    page = browser.new_page(viewport={"width": 1200, "height": 900})
    page.goto(base + "guides/engage-marin/campaigns.html")
    prev = page.locator(".guide-pager__prev .guide-pager__direction")
    nxt = page.locator(".guide-pager__next .guide-pager__direction")
    require(prev.evaluate("el => el.firstElementChild && el.firstElementChild.tagName") == "svg" and prev.inner_text().strip() == "Previous", "Pager: Previous has the arrow to the left of its text")
    require(nxt.evaluate("el => el.lastElementChild && el.lastElementChild.tagName") == "svg" and nxt.inner_text().strip() == "Next", "Pager: Next has the arrow to the right of its text")
    require(page.locator(".guide-pager svg").evaluate_all("els => els.every((e) => e.getAttribute('aria-hidden') === 'true')"), "Pager: the arrows are hidden from assistive technology")
    gap = page.evaluate("() => { const links = [...document.querySelectorAll('.guide-outline li a')]; return links.slice(2, 5).map((a, i) => a.getBoundingClientRect().top - links[i + 1].getBoundingClientRect().top); }")
    require(all(g < 36 for g in gap), f"Guide outline: link rows are close together: {gap}")
    page.close()


def check_lifecycle(browser, base):
    """The lifecycle is drawn above the page, not inside it; the current step is not a link, and each step works."""
    page = browser.new_page(viewport={"width": 1200, "height": 900})
    page.goto(base + "guides/engage-marin/campaigns.html")
    require(page.locator("article.content .guide-lifecycle").count() == 0 and page.locator("main > nav.guide-lifecycle").count() == 1, "Lifecycle: it sits above the page, outside the content box")
    require(page.locator(".guide-lifecycle li").all_inner_texts() == ["Plan", "Create", "Partner", "Launch", "Monitor", "Organize", "Update", "Close"], "Lifecycle: the eight steps in order")
    require(page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Create"] and page.locator(".guide-lifecycle a[aria-current=step]").count() == 1, "Lifecycle: on a page of a phase, its step is marked and links to the phase's landing page")
    require(page.locator(".guide-lifecycle a").count() == 8, "Lifecycle: every step is a link")
    # Every step goes to a landing page of its own for that phase, never to one of the phase's pages.
    hrefs = page.locator(".guide-lifecycle a").evaluate_all("els => els.map((e) => e.getAttribute('href'))")
    require(hrefs == ["plan.html", "create.html", "partner.html", "launch.html", "monitor.html", "organize.html", "update.html", "close.html"], f"Lifecycle: each step goes to its own landing page: {hrefs}")
    page.click(".guide-lifecycle a:text-is('Partner')")
    page.wait_for_url("**/partner.html")
    require(page.url.endswith("/partner.html") and page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Partner"] and page.locator(".guide-lifecycle span[aria-current=step]").count() == 1, "Lifecycle: a step goes to its landing page, marks only that step, and is plain text there")
    page.goto(base + "guides/engage-marin/create.html")
    require(page.locator("h1").inner_text() == "Create" and page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Create"], "Landing page: Create")
    require(page.inner_text(".doc-description").startswith("Start a question or campaign."), "Landing page: the sentence is the playbook's own")
    links = page.locator("article.content .guide-quick-links a .guide-quick-links__question").all_inner_texts()
    require(links == ["Campaigns", "Questions", "About page", "Welcome video", "First post"], f"Landing page: it lists the pages of the phase, in guide order: {links}")
    page.click("article.content .guide-quick-links .guide-quick-links__question:text-is('Questions')")
    page.wait_for_url("**/questions.html")
    require(page.url.endswith("/questions.html") and page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Create"], "A page of a phase keeps that phase marked")
    require("Create" in page.locator("nav.breadcrumb-nav").inner_text(), "A page of a phase has the phase in its breadcrumb")
    page.goto(base + "guides/engage-marin/how-it-works.html")
    require(page.locator(".guide-lifecycle [aria-current=step]").count() == 0 and page.locator(".guide-lifecycle a").count() == 8, "Lifecycle: How it works shows the steps with none marked")
    page.goto(base + "guides/engage-marin/moderation.html")
    require(page.locator(".guide-lifecycle").count() == 0, "Lifecycle: pages outside the process do not show it")
    page.goto(base + "guides/engage-marin/questions.html")
    require("Content builder" not in page.inner_text("article.content"), "Questions: no Content builder section")
    page.close()


def check_guide_home(browser, base):
    """The guide's home page says what the guide is and where each part starts, not a copy of the menu."""
    page = browser.new_page(viewport={"width": 1200, "height": 900})
    page.goto(base + "guides/engage-marin/index.html")
    require(page.locator("h1").inner_text() == "Engage Marin Playbook" and page.locator(".guide-outline a[aria-current=page]").inner_text() == "Engage Marin Playbook", "Home: the page and the menu item are the guide's name, not Quick start")
    require("Quick start" not in page.inner_text("body"), "Home: no Quick start")
    headings = [h.rstrip(" #") for h in page.locator("article.content h2").all_inner_texts()]
    require(headings == ["The lifecycle", "Getting started", "Examples and reference"], f"Home: the sections: {headings}")
    steps = page.locator("#lifecycle .guide-quick-links .guide-quick-links__question").all_inner_texts()
    require(steps == ["1. Plan", "2. Create", "3. Partner", "4. Launch", "5. Monitor", "6. Organize", "7. Update", "8. Close"], f"Home: the lifecycle steps: {steps}")
    require(page.locator("#lifecycle .guide-quick-links a >> nth=1").get_attribute("href") == "create.html", "Home: a lifecycle step goes to its landing page")
    require("structured-data.json" not in page.inner_text("article.content") and page.locator("#key-terms, #links").count() == 0, "Home: no data link, key terms or links section")
    page.goto(base + "guides/engage-marin/links.html")
    require(page.locator(".guide-outline a[aria-current=page]").inner_text() == "Links" and page.locator("h1").inner_text() == "Links", "Links: the page is in the Reference group")
    hrefs = page.locator("article.content a[target=_blank]").evaluate_all("els => els.map((e) => e.getAttribute('href'))")
    require(hrefs == ["https://engage.marincounty.gov", "https://engage.marincounty.gov/about/community-guidelines"], f"Links: the Engage Marin links: {hrefs}")
    require(all("opens in a new tab" in x for x in page.locator("article.content a[target=_blank]").all_inner_texts()), "Links: each says it opens in a new tab")
    page.goto(base + "guides/engage-marin/learn.html")
    require(page.locator(".guide-outline a[aria-current=page]").inner_text() == "Learn" and page.locator(".guide-outline h2:has-text('Reference') + ul li").all_inner_texts() == ["Content limits", "Links", "Learn"], "Learn: the page is in the Reference group, after Links")
    cards = page.locator("article.content .guide-quick-links .guide-quick-links__question").all_inner_texts()
    require(cards == ["Engage Marin 101", "Engage Marin 101 notes", "Engage Marin 101 slides", "Engage Marin 101 quiz"], f"Learn: the course and its three parts: {cards}")
    hrefs = page.locator("article.content a[target=_blank]").evaluate_all("els => els.map((e) => e.getAttribute('href'))")
    require(hrefs[0].endswith("/marin-learn/?set=engage-marin-101") and "view=read&resource=engage-marin-101-notes" in hrefs[1] and "view=slides&resource=engage-marin-101-slides" in hrefs[2] and "view=quiz&resource=engage-marin-101-quiz" in hrefs[3], f"Learn: each card goes to its part of the course: {hrefs}")
    page.close()


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
            check_engage_marin(browser, base)
            check_pager(browser, base)
            check_guide_home(browser, base)
            check_lifecycle(browser, base)
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
