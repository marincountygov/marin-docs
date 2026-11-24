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
    require(toggle.get_attribute("aria-expanded") == "true" and page.locator(".menu-panel:visible a, .menu-panel:visible button").count() == 3, "SOP: the menu opens with two files and Print or save as PDF")
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
    require(page.locator("a.action-button[href$='.pdf']").count() == 0, "Guide: no PDF link (the source PDF is internal)")
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
    require(page.locator("#download-panel button").all_text_contents() == ["Text", "HTML", "Markdown", "JSON (this page)", "JSON (whole guide)", "Print or save as PDF"], "Engage Marin: Download options")
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
    prev = page.locator(".doc-pager__prev .doc-pager__direction")
    nxt = page.locator(".doc-pager__next .doc-pager__direction")
    require(prev.evaluate("el => el.firstElementChild && el.firstElementChild.tagName") == "svg" and prev.inner_text().strip() == "Previous", "Pager: Previous has the arrow to the left of its text")
    require(nxt.evaluate("el => el.lastElementChild && el.lastElementChild.tagName") == "svg" and nxt.inner_text().strip() == "Next", "Pager: Next has the arrow to the right of its text")
    require(page.locator(".doc-pager svg").evaluate_all("els => els.every((e) => e.getAttribute('aria-hidden') === 'true')"), "Pager: the arrows are hidden from assistive technology")
    gap = page.evaluate("() => { const links = [...document.querySelectorAll('.doc-nav li a')]; return links.slice(2, 5).map((a, i) => a.getBoundingClientRect().top - links[i + 1].getBoundingClientRect().top); }")
    require(all(g < 36 for g in gap), f"Guide outline: link rows are close together: {gap}")
    page.close()


def check_lifecycle(browser, base):
    """The lifecycle is drawn above the page, not inside it; the current step is not a link, and each step works."""
    page = browser.new_page(viewport={"width": 1200, "height": 900})
    page.goto(base + "guides/engage-marin/campaigns.html")
    require(page.locator("article.content .guide-lifecycle").count() == 0 and page.locator("#start > nav.guide-lifecycle").count() == 1, "Lifecycle: it sits above the page, outside the content box")
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
    require(page.locator("h1.doc-title").inner_text() == "Create" and page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Create"], "Landing page: Create")
    require(page.inner_text(".doc-description").startswith("Start a question or campaign."), "Landing page: the sentence is the playbook's own")
    links = page.locator("article.content .guide-quick-links a .guide-quick-links__question").all_inner_texts()
    require(links == ["Campaigns", "Questions", "About page", "Welcome video", "First post"], f"Landing page: it lists the pages of the phase, in guide order: {links}")
    page.click("article.content .guide-quick-links .guide-quick-links__question:text-is('Questions')")
    page.wait_for_url("**/questions.html")
    require(page.url.endswith("/questions.html") and page.locator(".guide-lifecycle [aria-current=step]").all_inner_texts() == ["Create"], "A page of a phase keeps that phase marked")
    require(page.locator("nav.breadcrumb-nav").count() == 0 and page.locator("marin-app-header").count() == 1, "A page has the shell header and no breadcrumb")
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
    require(page.locator("h1.doc-title").inner_text() == "Engage Marin Playbook" and page.locator(".doc-nav a[aria-current=page]").inner_text() == "Engage Marin Playbook", "Home: the page and the menu item are the guide's name, not Quick start")
    require("Quick start" not in page.inner_text("body"), "Home: no Quick start")
    headings = [h.rstrip(" #") for h in page.locator("article.content h2").all_inner_texts()]
    require(headings == ["The lifecycle", "Getting started", "Examples and reference"], f"Home: the sections: {headings}")
    steps = page.locator("#lifecycle .guide-quick-links .guide-quick-links__question").all_inner_texts()
    require(steps == ["1. Plan", "2. Create", "3. Partner", "4. Launch", "5. Monitor", "6. Organize", "7. Update", "8. Close"], f"Home: the lifecycle steps: {steps}")
    require(page.locator("#lifecycle .guide-quick-links a >> nth=1").get_attribute("href") == "create.html", "Home: a lifecycle step goes to its landing page")
    require("structured-data.json" not in page.inner_text("article.content") and page.locator("#key-terms, #links").count() == 0, "Home: no data link, key terms or links section")
    page.goto(base + "guides/engage-marin/links.html")
    require(page.locator(".doc-nav a[aria-current=page]").inner_text() == "Links" and page.locator("h1.doc-title").inner_text() == "Links", "Links: the page is in the Reference group")
    hrefs = page.locator("article.content a[target=_blank]").evaluate_all("els => els.map((e) => e.getAttribute('href'))")
    require(hrefs == ["https://engage.marincounty.gov", "https://engage.marincounty.gov/about/community-guidelines"], f"Links: the Engage Marin links: {hrefs}")
    require(all("opens in a new tab" in x for x in page.locator("article.content a[target=_blank]").all_inner_texts()), "Links: each says it opens in a new tab")
    page.goto(base + "guides/engage-marin/learn.html")
    require(page.locator(".doc-nav a[aria-current=page]").inner_text() == "Learn" and page.locator(".doc-nav h2:has-text('Reference') + ul li").all_inner_texts() == ["Content limits", "Links", "Learn"], "Learn: the page is in the Reference group, after Links")
    cards = page.locator("article.content .guide-quick-links .guide-quick-links__question").all_inner_texts()
    require(cards == ["Engage Marin 101", "Engage Marin 101 notes", "Engage Marin 101 slides", "Engage Marin 101 quiz"], f"Learn: the course and its three parts: {cards}")
    hrefs = page.locator("article.content a[target=_blank]").evaluate_all("els => els.map((e) => e.getAttribute('href'))")
    require(hrefs[0].endswith("/marin-learn/?set=engage-marin-101") and "view=read&resource=engage-marin-101-notes" in hrefs[1] and "view=slides&resource=engage-marin-101-slides" in hrefs[2] and "view=quiz&resource=engage-marin-101-quiz" in hrefs[3], f"Learn: each card goes to its part of the course: {hrefs}")
    page.close()


def check_print(browser, base):
    """Printing a guide page, a regulation or an SOP prints the document: no navigation, search, actions or pager; the text fills the page;
    a link to another site shows its address; and Print or save as PDF is in the Download menu."""
    pages = {"a regulation": "pmrs/pmr-24.html", "a guide page": "guides/engage-marin/before-launch.html", "an SOP": "sop/airfield-inspection-and-hazard-identification.html"}
    for kind, path in pages.items():
        context = browser.new_context(viewport={"width": 1000, "height": 800})
        try:
            page = context.new_page()
            page.goto(base + path)
            page.wait_for_selector("marin-app-header .app-header")
            page.evaluate("() => { window.__prints = 0; window.print = () => { window.__prints += 1; }; }")
            page.click(".doc-actions [aria-controls=download-panel], .doc-actions [aria-controls=download-menu-panel]")
            page.click("button:has-text('Print or save as PDF')")
            require(page.evaluate("window.__prints") == 1, f"{kind}: Print or save as PDF opens the print dialog")
            page.emulate_media(media="print")
            for selector in (".doc-nav", ".doc-actions", ".toc", ".app-header", ".app-footer"):
                require(page.locator(selector).count() == 0 or not page.locator(selector).first.is_visible(), f"{kind}: {selector} is left off the print")
            if page.locator(".doc-pager").count():
                require(not page.locator(".doc-pager").first.is_visible(), f"{kind}: the pager is left off the print")
            widths = page.evaluate("() => { const r = document.querySelector('article').getBoundingClientRect(); return [r.left, r.width]; }")
            require(widths[1] > 900 and widths[0] < 40, f"{kind}: the text fills the page: {widths}")
            if page.locator("article a[href^=http]").count():
                after = page.evaluate("getComputedStyle(document.querySelector('article a[href^=http]'), '::after').content")
                require("http" in after, f"{kind}: a link to another site shows its address: {after}")
        finally:
            context.close()


def check_citation(browser, base):
    """Copy, then Citation: the citation of the section the address points at, or of the regulation when it points at none; only what the page
    already says (the manual, the heading, the effective date when the data has one), the address and the day it was copied."""
    import datetime
    import json
    graph = json.loads((ROOT / "pmrs/data/regulations.jsonld").read_text(encoding="utf-8"))["@graph"]
    chapters = [n for n in graph if n.get("codificationLevel") == "chapter"]
    has = lambda n: any(i.get("propertyID") == "local:pmr-effective-date-as-written" for i in n.get("identifier", []))
    without = next(n for n in chapters if not has(n))["legislationIdentifier"].replace("PMR", "").strip()
    today = datetime.date.today().isoformat()
    context = browser.new_context(viewport={"width": 1000, "height": 800})
    try:
        page = context.new_page()

        def cite(path):
            page.goto(base + path)
            page.wait_for_selector("marin-app-header .app-header")
            page.evaluate("() => { window.__copied = null; window.marinCopyText = (t) => { window.__copied = t; return Promise.resolve(true); }; }")
            page.click(".doc-actions [aria-controls=copy-panel]")
            page.click("button[data-copy-format=citation]")
            page.wait_for_function("() => window.__copied !== null")
            return page.evaluate("window.__copied"), page.locator(".doc-action-status").inner_text()

        text, status = cite("pmrs/pmr-24.html#24-3")
        require(text == f"County of Marin, Personnel Management Regulations, PMR 24.3 Formal Grievance (effective 2005-01). {base}pmrs/pmr-24.html#24-3 (accessed {today}).", f"A section: {text!r}")
        require(status == "Citation copied.", f"The status says it was copied: {status!r}")
        text, _ = cite("pmrs/pmr-24.html")
        require(text == f"County of Marin, Personnel Management Regulations, PMR 24: Grievance Procedure (effective 2005-01). {base}pmrs/pmr-24.html (accessed {today}).", f"The regulation: {text!r}")
        text, _ = cite("pmrs/pmr-24.html#source")
        require("PMR 24: Grievance Procedure" in text and "#source" not in text and "PMR 24.3" not in text, f"A heading that is not a numbered section cites the regulation: {text!r}")
        text, _ = cite(f"pmrs/pmr-{without}.html")
        require("effective" not in text and text.startswith("County of Marin, Personnel Management Regulations, PMR "), f"No effective date in the data, none in the citation: {text!r}")
    finally:
        context.close()


def check_glossary(browser, base):
    """The glossary: reached from a regulation's navigation, found by a search of the manual, its menu has no citation, and a term's link opens
    the section that defines it."""
    context = browser.new_context(viewport={"width": 1100, "height": 800})
    try:
        page = context.new_page()
        page.goto(base + "pmrs/pmr-24.html")
        page.wait_for_selector("marin-app-header .app-header")
        page.locator(".doc-nav summary", has_text="Reference").click()
        page.locator(".doc-nav a", has_text="Glossary").click()
        page.wait_for_url("**/pmrs/glossary.html")
        require(page.locator("h1").nth(1).inner_text() == "Glossary" and page.locator(".doc-nav a[aria-current=page]").inner_text() == "Glossary", "The glossary opens from the navigation and is marked there")
        require(page.locator("dl.doc-glossary dt").count() >= 20, "The terms are listed")
        page.click(".doc-actions [aria-controls=copy-panel]")
        require(page.locator("#copy-panel button").all_text_contents() == ["Text", "HTML", "Markdown"], "The glossary has no citation")
        page.keyboard.press("Escape")
        page.fill(".doc-nav__search input", "anniversary")
        page.wait_for_selector(".doc-nav__results a")
        require(page.locator(".doc-nav__results a", has_text="Anniversary Date").count() == 1, "A search of the manual finds the term")
        page.goto(base + "pmrs/glossary.html")
        page.locator("a.doc-glossary__source").first.click()
        page.wait_for_url("**/pmrs/pmr-2.html#2-1")
        require(page.locator("[id='2-1']").is_visible(), "A term's link opens the section that defines it")
    finally:
        context.close()


def check_section_copy(browser, base):
    """At the end of each numbered section: Copy citation and Copy text for that section alone, with their own status line; the page's own copy
    leaves the buttons out; printing leaves them off."""
    import datetime
    today = datetime.date.today().isoformat()
    context = browser.new_context(viewport={"width": 1100, "height": 800})
    try:
        page = context.new_page()
        page.goto(base + "pmrs/pmr-24.html")
        page.wait_for_selector("marin-app-header .app-header")
        numbered = page.locator("article section > h2[id]").evaluate_all("els => els.filter((e) => /^[0-9]+-[0-9]+$/.test(e.id)).length")
        require(numbered >= 4 and page.locator(".section-actions").count() == numbered, f"One set of buttons for each numbered section: {numbered}")
        require(page.locator("section:has(h2#source) .section-actions").count() == 0, "The Source section has none")
        page.evaluate("() => { window.__c = null; window.__r = null; window.marinCopyText = (t) => { window.__c = t; return Promise.resolve(true); }; window.marinCopyRich = (t, h) => { window.__r = [t, h]; return Promise.resolve(true); }; }")
        # the address names no section: the buttons still cite their own
        section = page.locator("section:has(h2[id='24-3'])")
        section.get_by_role("button", name="Copy citation for 24.3").click()
        page.wait_for_function("() => window.__c !== null")
        cited = page.evaluate("window.__c")
        require(cited == f"County of Marin, Personnel Management Regulations, PMR 24.3 Formal Grievance (effective 2005-01). {base}pmrs/pmr-24.html#24-3 (accessed {today}).", f"The citation of a section: {cited!r}")
        require(section.locator(".section-actions__status").inner_text() == "Citation copied.", "Each section says it copied, beside its own buttons")
        section.get_by_role("button", name="Copy text of 24.3").click()
        page.wait_for_function("() => window.__r !== null")
        text, html = page.evaluate("window.__r")
        require(text.startswith("24.3 Formal Grievance") and "Grievance Form" in text, f"The text of the section: {text[:80]!r}")
        require("24.4 " not in text.split("\n")[0] and "Copy citation" not in text and "Copy text" not in text and "Citation copied" not in text, "Only that section, and not the buttons")
        require("<h2" in html and "data-section-copy" not in html, "The rich text has the heading and no buttons")
        require("Copy citation" not in page.evaluate("marinContentFormats(document.querySelector('article')).text"), "The page's own copy leaves the buttons out")
        page.emulate_media(media="print")
        require(not page.locator(".section-actions").first.is_visible(), "The buttons are left off the print")
    finally:
        context.close()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            check_sop(browser, base)
            check_guide(browser, base)
            check_engage_marin(browser, base)
            check_pager(browser, base)
            check_guide_home(browser, base)
            check_lifecycle(browser, base)
            check_print(browser, base)
            check_citation(browser, base)
            check_glossary(browser, base)
            check_section_copy(browser, base)
        finally:
            browser.close()
            server.shutdown()
    print("Marin Docs browser test (guide and SOP pages): PASS")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
