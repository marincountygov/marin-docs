"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Core = require("../search/job-classes-pay/job-pay-core.js");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/job-pay-sample.json"), "utf8"));

const rows = Core.normalizeRows(fixture);
assert.equal(rows.length, 5);
assert.deepEqual(rows.map((row) => row.job_class_code), ["037A", "0302", "0210", "0561", "0000"]);
assert.equal(rows[0].title, "ACCOUNTANT I");
assert.equal(rows[0].min_hourly, 41.09);
assert.equal(rows[0].max_hourly, 48.9);
assert.equal(rows[0].hours_per_period, 75);
assert.equal(rows[0].number_of_steps, 5);
assert.equal(rows[0].payband, "under-100k");
assert.equal(rows[1].payband, "100k-150k");
assert.equal(rows[2].payband, "250k-plus");
assert.equal(rows[2].number_of_steps, 3);
assert.deepEqual(rows[2].steps.map((step) => step.number), [3, 4, 5], "unused zero-dollar pay steps omitted");
assert.equal(rows[2].min_yearly, 282256, "source minimum is used instead of a zero placeholder");
assert.equal(rows[3].steps.length, 2, "missing intermediate pay steps do not invent values");
assert.equal(rows[4].titlegroup, "Other");
assert.equal(Core.groupForTitle("Accountant"), "A–E");
assert.equal(Core.groupForTitle("Technician"), "P–T");
assert.equal(Core.numeric("$12,345.67"), 12345.67);
assert.equal(Core.numeric(""), null);
assert.equal(Core.numeric("N/A"), null);
assert.throws(() => Core.normalizeRows({}), /array/);
assert.equal(Core.normalizeRows([null, [], {}, { title: "  " }]).length, 0);

const alternate = Core.normalize({
  "Job Title": "STAFF ENGINEER", "Class Code": "0101", "Hours Per Pay Period": 80,
  "Hourly Step 3": "$72.55", "Yearly Step 3": "$150,904", "Minimum Yearly": "$150,904",
}, 7);
assert.equal(alternate.id, 7);
assert.equal(alternate.job_class_code, "0101");
assert.equal(alternate.hours_per_period, 80);
assert.equal(alternate.min_yearly, 150904);
assert.equal(alternate.steps[0].hourly, 72.55);
assert.equal(alternate.payband, "150k-200k");

const html = fs.readFileSync(path.join(__dirname, "../search/job-classes-pay/index.html"), "utf8");
const js = fs.readFileSync(path.join(__dirname, "../search/job-classes-pay/job-pay.js"), "utf8");
assert.ok(!/meeting.cost|meeting-cost|meeting timer|employer costs/i.test(html + js), "no meeting-cost calculator in integration");
console.log("Job classes and pay data/unit tests: PASS");
