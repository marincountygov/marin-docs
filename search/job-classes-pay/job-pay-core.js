/* Pure job-class and pay data functions. No network, personal data, or dependencies. */
((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MarinJobPayCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const PAY_BANDS = [
    { value: "under-100k", label: "Under $100,000", min: -Infinity, max: 100000 },
    { value: "100k-150k", label: "$100,000–$149,999", min: 100000, max: 150000 },
    { value: "150k-200k", label: "$150,000–$199,999", min: 150000, max: 200000 },
    { value: "200k-250k", label: "$200,000–$249,999", min: 200000, max: 250000 },
    { value: "250k-plus", label: "$250,000 or more", min: 250000, max: Infinity },
  ];
  const TITLE_GROUPS = ["A–E", "F–J", "K–O", "P–T", "U–Z"];

  function canonicalKey(key) {
    return String(key).replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  }

  function fieldsOf(raw) {
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [canonicalKey(key), value]));
  }

  function field(fields, ...aliases) {
    for (const alias of aliases) {
      const value = fields[canonicalKey(alias)];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return "";
  }

  function numeric(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const parsed = Number(String(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function positive(value) {
    const number = numeric(value);
    return number !== null && number > 0 ? number : null;
  }

  function groupForTitle(title) {
    const first = String(title).trim().charAt(0).toUpperCase();
    if (!/^[A-Z]$/.test(first)) return "Other";
    return TITLE_GROUPS.find((group) => first >= group[0] && first <= group[group.length - 1]) || "Other";
  }

  function payBand(maxYearly) {
    return PAY_BANDS.find((band) => maxYearly !== null && maxYearly >= band.min && maxYearly < band.max)?.value || "unknown";
  }

  function normalize(raw, index) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const fields = fieldsOf(raw);
    const title = String(field(fields, "title", "job_title", "classification_title", "class_title")).trim();
    const code = String(field(fields, "job_class_code", "class_code", "job_code")).trim();
    if (!title) return null;
    const steps = [];
    for (let index = 1; index <= 5; index += 1) {
      const hourly = positive(field(fields, `hourly_step_${index}`, `step_${index}_hourly`, `hourly_${index}`));
      const yearly = positive(field(fields, `yearly_step_${index}`, `step_${index}_yearly`, `yearly_${index}`));
      if (hourly !== null || yearly !== null) steps.push({ number: index, hourly, yearly });
    }
    const annualValues = steps.map((step) => step.yearly).filter((value) => value !== null);
    const hourlyValues = steps.map((step) => step.hourly).filter((value) => value !== null);
    const sourceMinYearly = positive(field(fields, "min_yearly", "minimum_yearly"));
    const sourceMaxYearly = positive(field(fields, "max_yearly", "maximum_yearly"));
    const hours = positive(field(fields, "hours_per_period", "hours_per_biweekly_period", "hours_per_bi_weekly_period", "biweekly_hours", "hours_per_pay_period"));
    return {
      id: index,
      title,
      job_class_code: code,
      hours_per_period: hours,
      number_of_steps: positive(field(fields, "number_of_steps", "num_steps", "steps")) ?? steps.length,
      min_yearly: sourceMinYearly ?? (annualValues.length ? Math.min(...annualValues) : null),
      max_yearly: sourceMaxYearly ?? (annualValues.length ? Math.max(...annualValues) : null),
      min_hourly: hourlyValues.length ? Math.min(...hourlyValues) : null,
      max_hourly: hourlyValues.length ? Math.max(...hourlyValues) : null,
      titlegroup: groupForTitle(title),
      payband: payBand(sourceMaxYearly ?? (annualValues.length ? Math.max(...annualValues) : null)),
      steps,
      raw,
    };
  }

  function normalizeRows(rawRows) {
    if (!Array.isArray(rawRows)) throw new Error("Expected an array of job class records.");
    return rawRows.map(normalize).filter(Boolean);
  }

  return { PAY_BANDS, TITLE_GROUPS, normalize, normalizeRows, numeric, groupForTitle, payBand };
});
