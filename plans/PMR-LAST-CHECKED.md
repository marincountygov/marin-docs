# The "Last checked" date of a regulation

Status: the page side is built; the data is not added yet (decision 2026-11-24). Written 2026-11-24.

## What it is for

A person reading a regulation here should know whether this copy matches what Human Resources publishes. The pages are built from data that marin-data reads from HR's published regulations, so the date that matters is **when marin-data last compared its copy with HR's**. Today the pages say nothing about it. (The "Effective" and "Prepared by" rows are the regulation's own words, not a check.)

## What is built

Each regulation's "About this regulation" block has a **Last checked** row, last in the block. It shows only when the data has a date, in the words the data gives, so today no page shows it. Nothing else changes when the date arrives.

The page reads the date from, in this order:

1. the regulation itself (`identifier` with `propertyID` `local:pmr-last-checked`), for a regulation checked on its own date;
2. the manual's source (the `LegislationObject` in `manual.jsonld`, the page of HR's that everything is read from), for one date for the whole manual.

A test supplies the date in a copy of the data and checks both, so the row cannot silently break.

## What the data change is (not done)

In marin-data (`extract_pmr.py` and `output/regulations/`):

- Write one `identifier` on the manual's source object: `{"@type": "PropertyValue", "propertyID": "local:pmr-last-checked", "value": "YYYY-MM-DD"}`, set to the day the extraction last ran and found its copy matching HR's page. A date per regulation is only needed if regulations are checked on different days.
- The value is the day of the check, as an ISO date. It is not the date HR changed anything (that is "Version dated" and "Applies from", which the data has for a few regulations).
- It changes only when a check runs. Decide what a check is: running the extraction and comparing, with a changed regulation updating its own text and keeping the date of the check.
- marin-data then syncs it to marin-docs the usual way (`consumers.json` already copies `manual.jsonld`), and `node scripts/build-pmrs.js` draws the row.

## Questions for when it is added

1. Does the extraction run on a schedule, or by hand? If by hand, the date is only as fresh as the last run, and the page should not suggest more.
2. One date for the manual, or one for each regulation?
3. If the check finds HR's text changed, is the changed text published here before anyone reads it? That is a content decision for Human Resources, not the page's.
