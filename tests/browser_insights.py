#!/usr/bin/env python3
"""Browser test of the Insights tab over HTTP with Playwright: the prompt it builds from a page's data and the live
sources (stubbed here, so the test needs no network), the choices, the question and Copy prompt.
Run: python3 tests/browser_insights.py"""
from __future__ import annotations

import json
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

MENTIONS = {"total": 2, "items": [
    {"title": "Older story", "source": "News", "sourceType": "news", "url": "https://example.com/old", "publishedAt": "2026-10-01T10:00:00Z", "date": "2026-10-01"},
    {"title": "Newer story", "source": "Bluesky", "sourceType": "social", "url": "https://example.com/new", "publishedAt": "2026-11-03T10:00:00Z", "date": "2026-11-03"}]}
REACH = {"records": [
    {"eventName": "Workshop one", "project": "Envision Marin", "agencies": ["Office of the County Executive"], "date": "2026-10-15", "startTime": "18:00", "type": "Meeting", "status": "Completed", "location": "Civic Center", "partners": []},
    {"eventName": "Workshop two", "project": "Envision Marin", "agencies": ["Office of the County Executive"], "date": "2026-11-19", "startTime": "18:00", "type": "Meeting", "status": "Planned", "location": "Mill Valley", "partners": []},
    {"eventName": "Someone else", "project": "Other", "agencies": ["District 3"], "date": "2026-10-20", "startTime": None, "type": "Meeting", "status": "Planned", "location": "Novato", "partners": []}]}
LINKS = {"data": None, "meta": {"suppressed": True}}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def stub(route):
    url = route.request.url
    body = MENTIONS if "monitors/" in url else REACH if "engagements" in url else LINKS if "/api/v1/links" in url else None
    if body is None:
        return route.continue_()
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(body))


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/"
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            context = browser.new_context(viewport={"width": 1100, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
            context.route("**/*", lambda route: stub(route) if not route.request.url.startswith(base) else route.continue_())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(base + "organization/county-executive.html#insights")
            page.wait_for_function("document.querySelector('[data-insights-preview]').textContent.includes('## Links')")
            require("characters" not in page.inner_text("[data-insights]") and "Or start from" not in page.inner_text("[data-insights]"), "no count, no starter questions")
            # Copy prompt, Preview and Reset are on one line.
            tops = page.eval_on_selector_all("[data-insights-copy], [data-insights-preview-toggle], [data-insights-reset]", "els => els.map(e => Math.round(e.getBoundingClientRect().top))")
            require(len(tops) == 3 and max(tops) - min(tops) <= 2, f"one line: {tops}")
            require(page.is_hidden("[data-insights-preview]"), "the preview starts closed")
            labels = page.eval_on_selector_all(".insights__option", "els => els.map(e => e.textContent.trim())")
            require(labels == ["About", "Programs", "Budget", "Mentions", "Reach engagements and campaigns", "Links"], f"choices: {labels}")
            nav = page.eval_on_selector_all("#app-nav a", "els => els.map(e => e.textContent)")
            require(nav[-1] == "Insights" and nav[-2] == "Data", f"Insights is last, after Data: {nav}")

            # The prompt: the rules, then each chosen section as JSON, then the question.
            page.fill("[data-insights-question]", "How much does it spend?")
            page.click("[data-insights-preview-toggle]")
            require(page.get_attribute("[data-insights-preview-toggle]", "aria-expanded") == "true" and page.is_visible("[data-insights-preview]"), "Preview opens the prompt")
            page.wait_for_function("document.querySelector('[data-insights-preview]').textContent.includes('How much does it spend?')")
            page.click("[data-insights-copy]")
            page.wait_for_function("document.querySelector('[data-insights-status]').textContent.startsWith('Copied')")
            prompt = page.evaluate("navigator.clipboard.readText()")
            require(prompt.startswith("You are helping a County of Marin staff member understand Office of the County Executive."), "opens with the role")
            require("Answer only from the data below." in prompt and "Confirmed (the data says so" in prompt, "rules and evidence labels")
            require(re.findall(r"^## (.*)$", prompt, re.M) == ["About", "Programs", "Budget", "Mentions", "Reach engagements and campaigns", "Links", "My question"], "sections in order")
            require(prompt.rstrip().endswith("How much does it spend?"), "the question is last")
            for name in ("Claude", "ChatGPT", "Copilot", "Gemini", "OpenAI", "Anthropic"):
                require(name not in prompt, f"names no AI product: {name}")
            blocks = re.findall(r"```json\n(.*?)\n```", prompt, re.S)
            data = [json.loads(b) for b in blocks]
            require(data[0]["name"] == "Office of the County Executive", "About is the record")
            require(data[3]["mentions"][0]["title"] == "Newer story" and data[3]["total"] == 2, "mentions, newest first")
            require([c["campaign"] for c in data[4]["campaigns"]] == ["Envision Marin"] and data[4]["campaigns"][0]["engagements"] == 2, "campaigns from this agency's events only")
            require(len(data[4]["engagements"]) == 2, "other agencies' events left out")
            require("fewer than 5" in data[5]["note"] or "under 5" in data[5]["note"], "suppressed links say why")

            # Choosing less shortens the prompt.
            page.uncheck("input[data-insights-section=mentions]")
            page.uncheck("input[data-insights-section=reach]")
            page.wait_for_function("(() => { const t = document.querySelector('[data-insights-preview]').textContent; return !t.includes('## Mentions') && !t.includes('## Reach'); })()")
            text = page.text_content("[data-insights-preview]")
            require("## Mentions" not in text and "## Reach" not in text and "## Budget" in text, f"unchecked sections are left out: {re.findall(r'^## .*$', text, re.M)}")
            # Reset puts every choice back, clears the question and closes the preview.
            page.click("[data-insights-reset]")
            require(page.eval_on_selector_all("input[data-insights-section]", "els => els.every(e => e.checked)"), "reset checks every choice")
            require(page.input_value("[data-insights-question]") == "" and page.is_hidden("[data-insights-preview]"), "reset clears the question and closes the preview")
            page.wait_for_function("document.querySelector('[data-insights-preview]').textContent.includes('## Mentions')")
            # Other pages have it too, with their own data.
            for url, first in (("service-areas/public-safety.html#insights", "Public Safety service area"), ("programs/cda-building-and-safety.html#insights", "Building and Safety program")):
                page.goto(base + url)
                page.click("[data-insights-preview-toggle]")
                page.wait_for_function("document.querySelector('[data-insights-preview]').textContent.length > 100")
                require(first in page.text_content("[data-insights-preview]").split("\n")[0], f"{url}: names its subject")
            require(not errors, f"no page errors: {errors}")
        finally:
            browser.close()
            server.shutdown()
    print("Marin Docs Insights browser test: PASS")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
