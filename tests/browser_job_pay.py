#!/usr/bin/env python3
"""Synthetic feed / browser regression test for Marin Docs job-class pay lookup.

Never sends requests to the live public service. Run: python3 tests/browser_job_pay.py
"""
from __future__ import annotations

import csv
import io
import json
import sys
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = json.loads((ROOT / 'tests/fixtures/job-pay-sample.json').read_text(encoding='utf-8'))


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def require(value, description):
    if not value:
        raise AssertionError(description)


def fake_api(route):
    route.fulfill(status=200, content_type='application/json', body=json.dumps(FIXTURE))


def visible_titles(page):
    return page.locator('#job-results > li:visible .job-card-title').all_inner_texts()


def test_lookup(browser, base):
    context = browser.new_context(viewport={'width': 1200, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'], accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('https://data.marincounty.gov/**', fake_api)

    # Directory, page structure, and live feed success.
    page.goto(base + 'search/index.html')
    require(page.locator('a[href="./job-classes-pay/"]').count() == 1, 'Directory links to new tool')
    require('meeting' not in page.locator('main').inner_text().lower(), 'Directory does not offer meeting estimator')
    page.get_by_role('link', name='Job classes and pay').click()
    page.wait_for_function('document.getElementById("job-total").textContent === "5"')
    require(page.url.rstrip('/').endswith('/search/job-classes-pay'), 'Search tool is located under search/')
    require(page.locator('#job-results > li').count() == 5, 'All five source records rendered')
    require(page.locator('#job-step-patterns').inner_text() == '3', 'Different published step patterns counted')
    require(page.locator('#job-pay-schedules').inner_text() == '2', 'Biweekly pay schedules counted')
    require(page.locator('#job-highest').inner_text() == '$312,728', 'Largest annual salary found')
    require(page.locator('#meeting-cost').count() == 0 and 'meeting' not in page.locator('main').inner_text().lower(), 'Meeting estimator not mounted')
    require(page.locator('h1').count() == 1, 'Page uses one h1')
    require(page.locator('#job-error').is_hidden(), 'No error state on successful load')
    require(page.locator('script[src*="job-pay"]:not([src*="meeting"])').count() == 2, 'Only pay lookup scripts are loaded')

    # Untrusted County strings are escaped rather than interpreted as markup.
    require(page.locator('#job-results script').count() == 0, 'Untrusted title does not inject scripts')
    require(any('<script>' in title for title in visible_titles(page)), 'Untrusted title stays visible as text')

    # Pay steps show published entries only: no fabricated zero-dollar steps.
    counsel = page.locator('#job-results > li[data-job-id="2"]')
    counsel.locator('details.job-card-details > summary').click()
    require(counsel.locator('.job-card-details table tbody tr').count() == 3, '3-step class has 3 salary rows')
    require(counsel.locator('.job-card-details table tbody th').all_inner_texts() == ['Step 3', 'Step 4', 'Step 5'], 'Zero placeholder steps omitted')
    require('$135.70' in counsel.locator('.job-card-details table tbody').inner_text(), 'Published step hourly rate displayed')

    # Search, URL state and clearing the filters.
    if page.locator('#filter-panel').get_attribute('data-open') == 'false':
        page.locator('#filter-toggle').click()
    page.locator('#job-search-input').fill('037A')
    page.wait_for_function('document.getElementById("job-results-count").textContent.startsWith("1 of 5")')
    require(visible_titles(page) == ['ACCOUNTANT I'], 'Search finds class by code')
    require('q=037a' in page.url, 'Search can be shared by query parameter')
    page.locator('#reset-filters-button').click()
    require(len(visible_titles(page)) == 5, 'Reset restores results')
    require('q=' not in page.url, 'Reset clears URL search parameter')

    page.locator('#payband-facet details').evaluate('(details) => { details.open = true; }')
    page.locator('#payband-facet input[value="250k-plus"]').check()
    require(visible_titles(page) == ['ASSISTANT COUNTY COUNSEL'], 'Pay-band facet filters classes')
    require('payband=250k-plus' in page.url, 'Facet state written to URL')
    page.locator('#reset-filters-button').click()
    page.locator('#hours-facet details').evaluate('(details) => { details.open = true; }')
    page.locator('#hours-facet input[value="75"]').check()
    require(sorted(visible_titles(page)) == ['ACCOUNTANT I', 'NURSE'], 'Hours facet filters classes')
    page.locator('#reset-filters-button').click()
    page.locator('#steps-facet details').evaluate('(details) => { details.open = true; }')
    page.locator('#steps-facet input[value="3"]').check()
    require(visible_titles(page) == ['ASSISTANT COUNTY COUNSEL'], 'Step-count facet filters classes')
    page.locator('#reset-filters-button').click()

    page.locator('#job-sort').select_option('max_yearly')
    page.locator('#job-sort-direction').select_option('desc')
    require(visible_titles(page)[0] == 'ASSISTANT COUNTY COUNSEL', 'Descending annual maximum sorts classes')
    page.locator('#job-sort').select_option('title')
    page.locator('#job-sort-direction').select_option('asc')

    # Comparison is capped at three job classes and can be cleared.
    page.locator('#job-results > li[data-job-id="0"] .job-compare-checkbox').check()
    page.locator('#job-results > li[data-job-id="1"] .job-compare-checkbox').check()
    page.locator('#job-results > li[data-job-id="2"] .job-compare-checkbox').check()
    require(page.locator('#job-compare').is_visible(), 'Comparison panel visible')
    require(page.locator('#job-compare table thead th').count() == 4, 'Comparison contains three selected classifications')
    require(page.locator('#job-results > li[data-job-id="3"] .job-compare-checkbox').is_disabled(), 'Fourth class is disabled')
    page.locator('#job-clear-compare').click()
    require(page.locator('#job-compare').is_hidden(), 'Clear comparison closes panel')

    # JSON/CSV export contains only filtered rows and CSV treats source as data, never as formulas.
    page.locator('#job-search-input').fill('037A')
    page.wait_for_function('document.getElementById("job-results-count").textContent.startsWith("1 of 5")')
    with page.expect_download() as download_event:
        page.locator('#job-export-json').click()
    download = download_event.value
    require(download.suggested_filename == 'marin-job-classes-pay.json', 'JSON filename')
    exported = json.loads(Path(download.path()).read_text(encoding='utf-8'))
    require(len(exported) == 1 and exported[0]['job_class_code'] == '037A', 'JSON export includes only filtered source records')
    with page.expect_download() as download_event:
        page.locator('#job-export-csv').click()
    download = download_event.value
    rows = list(csv.reader(io.StringIO(Path(download.path()).read_text(encoding='utf-8-sig'))))
    require(len(rows) == 2 and rows[1][0] == 'ACCOUNTANT I', 'CSV export contains one filtered class')
    require(rows[1][1] == '037A' and rows[1][8] == '41.09', 'CSV includes original step data')
    page.locator('#reset-filters-button').click()
    page.locator('#job-search-input').fill('DANGEROUS')
    page.wait_for_function('document.getElementById("job-results-count").textContent.startsWith("1 of 5")')
    with page.expect_download() as download_event:
        page.locator('#job-export-csv').click()
    risky = list(csv.reader(io.StringIO(Path(download_event.value.path()).read_text(encoding='utf-8-sig'))))
    require(risky[1][0].startswith("'=DANGEROUS()"), 'CSV protects against spreadsheet formulas')

    # Copy link remains powered by the MarinOS shell.
    page.locator('#reset-filters-button').click()
    page.locator('#job-results > li[data-job-id="0"] button.job-copy-link').click()
    page.wait_for_function('document.getElementById("app-status-message").textContent.includes("Copied job class link")')
    copied = page.evaluate('navigator.clipboard.readText()')
    require('q=037A' in copied, 'Copy link points to selected class search')

    # The results remain within the viewport at mobile width.
    page.set_viewport_size({'width': 390, 'height': 850})
    page.wait_for_timeout(200)
    require(page.evaluate('document.documentElement.scrollWidth <= innerWidth + 2'), 'No horizontal scrolling on phone')
    require(not errors, f'No page errors: {errors}')
    context.close()


def test_url_and_failure(browser, base):
    context = browser.new_context(viewport={'width': 900, 'height': 850})
    page = context.new_page()
    page.route('https://data.marincounty.gov/**', fake_api)
    page.goto(base + 'search/job-classes-pay/?q=nurse&hours=75')
    page.wait_for_function('document.getElementById("job-total").textContent === "5"')
    require(visible_titles(page) == ['NURSE'], 'URL state restores search and facets')
    require(page.locator('#hours-facet input[value="75"]').is_checked(), 'Facet checkbox restored from URL')
    context.close()

    context = browser.new_context()
    page = context.new_page()
    calls = {'count': 0}
    def unavailable_then_recover(route):
        calls['count'] += 1
        if calls['count'] == 1:
            route.fulfill(status=503, content_type='text/plain', body='Unavailable')
        else:
            fake_api(route)
    page.route('https://data.marincounty.gov/**', unavailable_then_recover)
    page.goto(base + 'search/job-classes-pay/')
    require(page.locator('#job-error').is_visible(), 'Load error is visible when API fails')
    page.locator('#job-retry').click()
    page.wait_for_function('document.getElementById("job-total").textContent === "5"')
    require(page.locator('#job-error').is_hidden() and calls['count'] == 2, 'Retry recovers successfully')
    context.close()

    context = browser.new_context()
    page = context.new_page()
    old = json.dumps({'savedAt': 10000000, 'rows': FIXTURE})
    page.add_init_script('localStorage.setItem("marin-docs-job-pay-cache-v1", ' + json.dumps(old) + ')')
    page.route('https://data.marincounty.gov/**', lambda route: route.fulfill(status=503, content_type='text/plain', body='Unavailable'))
    page.goto(base + 'search/job-classes-pay/')
    page.wait_for_function('document.getElementById("job-total").textContent === "5"')
    require('older copy' in page.locator('#job-feed-status').inner_text(), 'Old cache is disclosed when live feed unavailable')
    context.close()


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_address[1]}/'
    try:
        with sync_playwright() as playwright:
            executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE')
            browser = playwright.chromium.launch(executable_path=executable) if executable else playwright.chromium.launch()
            try:
                test_lookup(browser, base)
                test_url_and_failure(browser, base)
            finally:
                browser.close()
    finally:
        server.shutdown()
    print('Marin Docs job class pay lookup browser tests (mock API, mobile, exports, security): PASS')


if __name__ == '__main__':
    try:
        main()
    except AssertionError as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        sys.exit(1)
