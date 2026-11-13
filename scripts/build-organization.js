#!/usr/bin/env node
// Builds the Organization collection from schemaGov JSON-LD.
//
//   node scripts/build-organization.js [source-dir] [--reach engagements.json] [--local]
//
// With a source-dir, organizations.jsonld and jurisdictions.jsonld are copied
// into organization/data/ first. With --reach (Marin Reach's
// data/engagements.json), the agency names Reach knows are saved to
// organization/data/reach-agencies.json, so a Reach link is written only when
// it will find something. --local points the "Related" links at localhost
// (see organization/links.json); never commit a build made with it.
// Then organization/index.html and one page per organization are written.
// Edit the data, never the generated pages.
// Hierarchy is read from parentOrganization only.

const fs = require('fs');
const path = require('path');
const budget = require('./budget-data');
const { actions, jsonBlock } = require('./page-actions');
const { insightsTab } = require('./insights');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'organization');
const DATA = path.join(OUT, 'data');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const reachAt = argv.indexOf('--reach');
const reachFile = reachAt >= 0 ? argv[reachAt + 1] : null;
const src = argv.find((a, i) => !a.startsWith('--') && (reachAt < 0 || i !== reachAt + 1));
const LOCAL = flag('--local');
if (reachFile) {
  const records = JSON.parse(fs.readFileSync(reachFile, 'utf8')).records;
  const names = [...new Set(records.flatMap((r) => r.agencies || []))].sort();
  fs.writeFileSync(path.join(DATA, 'reach-agencies.json'), JSON.stringify(names, null, 2) + '\n');
}
if (src) {
  for (const f of ['organizations.jsonld', 'jurisdictions.jsonld', 'programs.jsonld', 'people.jsonld', 'posts.jsonld', 'roles.jsonld', 'sources.json']) {
    fs.copyFileSync(path.join(src, f), path.join(DATA, f));
  }
}
if (src) budget.useData(src);
const budgetData = budget.load();
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'))['@graph'];
const links = JSON.parse(fs.readFileSync(path.join(OUT, 'links.json'), 'utf8'));
const readJson = (f) => (fs.existsSync(path.join(OUT, f)) ? JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')) : []);
const orgs = read('organizations.jsonld');
const jurisdictions = read('jurisdictions.jsonld');
const programs = read('programs.jsonld');
const people = read('people.jsonld');
const posts = read('posts.jsonld');
const roles = read('roles.jsonld');
const sources = JSON.parse(fs.readFileSync(path.join(DATA, 'sources.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugOf = (id) => id.split(/[/:]/).pop();

const byId = new Map(orgs.map((o) => [o['@id'], o]));
const jurById = new Map(jurisdictions.map((j) => [j['@id'], j]));
const personById = new Map(people.map((p) => [p['@id'], p]));
const postById = new Map(posts.map((p) => [p['@id'], p]));
const slugs = new Set();
for (const o of orgs) {
  const s = slugOf(o['@id']);
  if (slugs.has(s)) throw new Error('Two organizations share the page name ' + s);
  slugs.add(s);
}
const county = orgs.find((o) => o.organizationClassification === 'government' && !o.parentOrganization);
const parentOf = (o) => (o.parentOrganization ? byId.get(o.parentOrganization['@id']) : null);
// Service areas, departments, divisions and other bodies are listed A to Z by name.
const byOrgName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });
const childrenOf = (o) => orgs.filter((c) => c.parentOrganization && c.parentOrganization['@id'] === o['@id']).sort(byOrgName);
const page = (o) => slugOf(o['@id']) + '.html';
// Service areas have their own section, and every program its own page. Paths are from the docs root.
const isArea = (o) => o.organizationClassification === 'serviceArea';
const areaSlug = (o) => slugOf(o['@id']).replace(/^service-area-/, '');
const urlOf = (o) => (isArea(o) ? `service-areas/${areaSlug(o)}.html` : `organization/${page(o)}`);
const programUrl = (p) => `programs/${slugOf(p['@id'])}.html`;
const rel = (from, url) => path.posix.relative(from, url);
const areaOf = (o) => { for (let x = o; x; x = parentOf(x)) if (isArea(x)) return x; return null; };
const descendantsOf = (o) => childrenOf(o).flatMap((c) => [c, ...descendantsOf(c)]);
const programsOf = (o) => {
  const ids = new Set([o, ...descendantsOf(o)].map((x) => x['@id']));
  const adminName = (p) => (byId.get([].concat(p.administeredBy || [])[0]['@id']) || {}).name || '';
  // A to Z by program name; programs that share a name (Administration) by the body that runs them.
  return programs.filter((p) => [].concat(p.administeredBy || []).some((a) => ids.has(a['@id'])))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) || adminName(a).localeCompare(adminName(b), 'en', { sensitivity: 'base' }));
};
const addressLine = (a) => [a.streetAddress, a.addressLocality, [a.addressRegion, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const termLabel = (d) => { const m = /^P(\d+)Y$/.exec(d || ''); return m ? `${m[1]}-year term` : d || ''; };
const { cleanDescription, cleanMission, cleanText, fixLabel } = require('./clean-text');
const orgNames = orgs.flatMap((o) => [o.name, ...(o.alternateName || [])]);
// A result card as the apps draw one, for records that are built into the page.
const BUDGET_NOTE = budget.BUDGET_NOTE;
const resultCard = ({ badge, title, href, byline, figures, text }) => `<li class="app-card mm-card"><div class="mm-card__body">${badge ? `<div class="mm-card__meta"><span class="app-badge">${esc(badge)}</span></div>` : ''}<h3 class="mm-card__title">${href ? `<a href="${esc(href)}">${esc(title)}</a>` : esc(title)}</h3>${byline ? `<p class="mm-card__byline">${byline}</p>` : ''}${figures ? `<p class="mm-card__byline">${esc(figures)}</p>` : ''}${text ? `<p class="mm-card__text">${esc(text)}</p>` : ''}</div></li>`;

const TYPE_LABEL = {
  government: 'Government', legislature: 'Legislature', executive: 'Executive', department: 'Department',
  agency: 'Agency', committee: 'Committee', commission: 'Commission', court: 'Court', office: 'Office',
  enterprise: 'Enterprise', division: 'Division', bureau: 'Bureau', authority: 'Authority', serviceArea: 'Service area',
};
const LEVEL_LABEL = {
  supranational: 'Supranational', national: 'National', regional: 'Regional', subregional: 'Subregional',
  municipal: 'Municipal', submunicipal: 'Submunicipal', specialPurpose: 'Special purpose', indigenous: 'Indigenous',
};
const SCHEME_LABEL = {
  'local:marin-links-agency-id': 'Agency id (Marin Links)',
  'local:marin-links-agency-code': 'Agency code (Marin Links)',
  'local:marin-mentions-monitor-id': 'Monitor id (Marin Mentions)',
  'local:marin-budget-department-code': 'Department code (Budget)',
  'local:marin-service-area-id': 'Service area id',
  'gs:local': 'Local id',
};
const typeLabel = (o) => TYPE_LABEL[o.organizationClassification] || o.organizationClassification;
const PLURAL_LABEL = {
  Government: 'Governments', Legislature: 'Legislatures', Executive: 'Executives', Department: 'Departments',
  Agency: 'Agencies', Committee: 'Committees', Commission: 'Commissions', Court: 'Courts', Office: 'Offices',
  Enterprise: 'Enterprises', Division: 'Divisions', Bureau: 'Bureaus', Authority: 'Authorities', 'Service area': 'Service areas',
};
// The heading over a list of child bodies comes from their own classification: when every child is the
// same kind (all divisions) it names that kind; when they are mixed it stays generic.
const childHeading = (kids) => {
  const kinds = [...new Set(kids.map((k) => k.organizationClassification))];
  return kinds.length === 1 ? PLURAL_LABEL[typeLabel(kids[0])] || 'Sub-agencies' : 'Sub-agencies';
};

const { ICON_BUILDING, ICON_LAYERS } = require('./icons');
const iconFor = (o) => (o.organizationClassification === 'serviceArea' ? ICON_LAYERS : ICON_BUILDING);
const FAVICON = "<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23000'/%3E%3Cg fill='none' stroke='%23e5b53b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round' transform='translate(9,9) scale(1.25)'%3E" + ICON_BUILDING.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'") + "%3C/g%3E%3C/svg%3E\">";

// A Dashboard link to a tab says it holds more: "All Programs".
const allLinks = (html) => html.replace(/(<p class="org-dash__more"><a [^>]*>)/g, '$1All ');
function shell(title, description, crumbs, body, icon = ICON_BUILDING) {
  const trail = crumbs.map(([label, href]) => (href ? `<a href="${href}">${esc(label)}</a>` : esc(label))).join(' <span aria-hidden="true">/</span> ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Marin Docs</title>${FAVICON}<meta name="description" content="${esc(description)}"><link rel="stylesheet" href="styles.css"></head><body><a class="skip-link" href="#main">Skip to main content</a><marin-os-banner></marin-os-banner><header class="site-header"><div class="header-inner"><span class="docs-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span><nav class="breadcrumb-nav" aria-label="Breadcrumb">${trail}</nav></div></header><main id="main" class="page" tabindex="-1">${allLinks(body)}</main><footer class="site-footer" role="contentinfo"><div class="footer-inner"><a href="https://marincountygov.github.io/marin-os/">MarinOS</a></div></footer><a class="app-feedback" href="https://form.asana.com/?k=qVUT83d5DBmlDiIyi-WAyQ&amp;d=23133298259496" target="_blank" rel="noreferrer">Feedback</a><script src="../vendor/marinos/marinos.js" defer></script></body></html>\n`;
}

function card(o) {
  return `<article class="app-card app-card--secondary"><span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${iconFor(o)}</svg></span><h3><a href="${rel('organization', urlOf(o))}">${esc(o.name)}</a></h3></article>`;
}

const groupHeading = (kind) => (kind === 'legislature' ? 'Legislature' : PLURAL_LABEL[TYPE_LABEL[kind]]);

function indexPage() {
  // Grouped by each body's own classification, in the order of the OrganizationClassification code list.
  // Service areas have their own section. Divisions are listed on their department's page.
  const listed = orgs.filter((o) => o !== county && o.organizationClassification !== 'division').sort(byOrgName);
  const order = Object.keys(TYPE_LABEL).filter((kind) => !['government', 'division', 'serviceArea'].includes(kind));
  const groups = order
    .map((kind) => [kind, listed.filter((o) => o.organizationClassification === kind)])
    .filter(([, members]) => members.length);
  const csvs = [{ id: 'table', label: 'organizations', rows: [['Name', 'Type', 'Part of', 'Website', 'Telephone'], ...groups.flatMap(([, members]) => members.map((o) => { const par = parentOf(o); return [o.name, typeLabel(o), par && par !== county ? par.name : '', o.url || '', o.telephone || '']; }))] }];
  const body = `<section class="hero"><h1>Organization</h1><p class="lede">Departments, offices, the legislature and other bodies of the <a href="${rel('organization', urlOf(county))}">${esc(county.name)}</a>.</p>${actions('organization', '#main', false, csvs)}</section>` +
    groups.map(([kind, members]) => `<h2>${esc(groupHeading(kind, members))}</h2><section class="docs-grid" aria-label="${esc(groupHeading(kind, members))}">${members.map(card).join('')}</section>`).join('') + jsonBlock(null, './page-data.js', csvs);
  return shell('Organization', 'Departments, offices, the legislature and other bodies of the County of Marin.', [['Marin Docs', '../index.html'], ['Organization', null]], body);
}

// A phone number is a link a phone can dial. US numbers get +1 and keep their own digits.
const telHref = (n) => { const d = String(n).replace(/\D/g, ''); return d.length === 10 ? 'tel:+1' + d : d.length === 11 && d[0] === '1' ? 'tel:+' + d : null; };
// A number that is not a whole US number stays plain text rather than dialling the wrong place.
const telLink = (n) => (telHref(n) ? `<a href="${telHref(n)}">${esc(n)}</a>` : esc(n));
const row = (label, html) => `<dt>${esc(label)}</dt><dd>${html}</dd>`;

// The links to other apps. A link is written only when the organization has the
// value that app filters on, so no page carries a link that finds nothing.
function relatedLinks(o) {
  const out = [];
  const slug = (o.identifier || []).find((i) => i.propertyID === 'local:marin-links-agency-id');
  for (const app of links.apps) {
    let value;
    if (app.value === 'name') value = o.name;
    else {
      const scheme = app.value.replace(/^identifier:/, '');
      const found = (o.identifier || []).find((i) => i.propertyID === scheme);
      value = found && found.value;
    }
    if (!value) continue;
    if (app.onlyValuesMatching && !new RegExp(app.onlyValuesMatching).test(value)) continue;
    if (app.onlyValuesIn && !readJson(app.onlyValuesIn).includes(value)) continue;
    const root = LOCAL ? app.local : app.base;
    const hrefFor = (cfg) => root + (cfg && cfg.useParam === false && !cfg.query ? '' : '?' + new URLSearchParams({ ...((cfg && cfg.query) || {}), ...(cfg && cfg.useParam === false ? {} : { [app.param]: (app.includeChildren ? values : [value]).join(',') }) }).toString());
    // An app that includes divisions (Mentions) also reads the files of the bodies under this one.
    const values = [value];
    if (app.includeChildren) {
      const scheme = app.value.replace(/^identifier:/, '');
      const walk = (x) => childrenOf(x).forEach((k) => { const f = (k.identifier || []).find((i) => i.propertyID === scheme); if (f && !values.includes(f.value)) values.push(f.value); walk(k); });
      walk(o);
    }
    out.push({ app, root, value, values, text: app.linkText ? app.linkText.replace('{name}', o.name) : `${o.name} ${app.appName}`, icon: app.icon, home: { id: app.id, label: app.appName, cfg: app.home, href: hrefFor(app.home) }, stats: app.stats ? { id: app.id + '-stats', label: app.appName + ' stats', cfg: app.stats, href: hrefFor(app.stats) } : null,
      // A second sub-tab between Home and Stats, when the app has one (Reach's campaigns).
      extra: app.campaigns ? { id: app.id + '-campaigns', label: app.campaignsLabel || 'More', cfg: app.campaigns, href: hrefFor(app.campaigns) } : null });
  }
  const sop = slug && links.procedures.pages[slug.value];
  if (sop) out.push({ app: null, icon: links.procedures.icon, text: `${o.name} ${links.procedures.appName}`, home: { id: 'procedures', label: links.procedures.appName, cfg: null, href: sop }, stats: null });
  return out;
}

// A short list on a Dashboard: secondary cards, three to a row, with only whole rows shown, and a link to the tab.
const dashShown = (n) => (n <= 3 ? n : Math.min(6, n - (n % 3)));
const dashCards = (list, icon, href) => `<div class="docs-grid docs-grid--3">${list.slice(0, dashShown(list.length)).map((x) => `<article class="app-card app-card--secondary"><span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon(x)}</svg></span><h3><a href="${href(x)}">${esc(x.name)}</a></h3></article>`).join('')}</div>`;
const dashSection = (id, label, list, icon, href) => (list.length ? `<section class="org-dash" aria-labelledby="dash-${esc(id)}"><h2 id="dash-${esc(id)}">${esc(label)}</h2>${dashCards(list, icon, href)}<p class="org-dash__more"><a href="#${esc(id)}">${esc(label)}</a></p></section>` : '');
const programsDash = (list, from) => dashSection('programs', 'Programs', list, () => ICON_LAYERS, (p) => rel(from, programUrl(p)));

// The file an app's data is read from: one for each value (an agency and its divisions), separated by spaces.
const srcOf = (r, base, src) => (r.values || [r.value]).map((v) => base + src.replace('{value}', encodeURIComponent(v))).join(' ');

function orgPage(o) {
  const parent = parentOf(o);
  const kids = childrenOf(o);
  const area = o.areaServed && jurById.get(o.areaServed['@id']);
  const desc = parent ? `${typeLabel(o)} of ${parent === county ? 'the ' : ''}${parent.name}.` : `The government of the ${o.name}.`;

  const overview = [row('Type', esc(typeLabel(o)))];
  if (o.governmentLevel) overview.push(row('Government level', esc(LEVEL_LABEL[o.governmentLevel] || o.governmentLevel)));
  if (parent) overview.push(row(isArea(parent) ? 'Service area' : 'Part of', `<a href="${rel('organization', urlOf(parent))}">${esc(parent.name)}</a>`));
  if (area) overview.push(row('Area served', esc(area.name)));
  if (o.url) overview.push(row('Website', `<a href="${esc(o.url)}">${esc(o.url)}</a>`));
  if (o.telephone) overview.push(row('Telephone', telLink(o.telephone)));
  if (o.address) overview.push(row('Address', esc(addressLine(o.address))));
  const budgetCode = (o.identifier || []).find((i) => i.propertyID === 'local:marin-budget-department-code');
  if (budgetCode) overview.push(row('Budget code', `<code>${esc(budgetCode.value)}</code>`));
  if (o.alternateName) overview.push(row('Also known as', o.alternateName.map(esc).join(', ')));
  if (o.description) overview.push(row('Description', esc(cleanDescription(o.description))));
  if (o.mission) overview.push(row('Mission', esc(cleanMission(o.mission))));

  // The bodies under this one get a tab of their own, named from their classification (Divisions).
  const subHeading = kids.length ? childHeading(kids) : '';
  const subId = slugOf(subHeading || 'x').toLowerCase();
  const subTab = kids.length
    ? `<section class="section" id="${subId}" data-tab-section="${subId}" aria-labelledby="${subId}-heading" hidden><h2 id="${subId}-heading">${esc(subHeading)}</h2><div class="docs-grid">${kids.map(card).join('')}</div></section>`
    : '';
  const related = relatedLinks(o);
  const ids = (o.identifier || []).map((i) => `<tr><td>${esc(SCHEME_LABEL[i.propertyID] || i.propertyID)}</td><td><code>${esc(i.value)}</code></td><td><code>${esc(i.propertyID)}</code></td></tr>`).join('');
  const record = [row('Record id', `<code>${esc(o['@id'])}</code>`), row('Record type', `<code>${esc(o['@type'])}</code>`)];
  if (parent) record.push(row('Parent record id', `<code>${esc(parent['@id'])}</code>`));
  if (area) record.push(row('Area served record id', `<code>${esc(area['@id'])}</code>`));

  // Programs this body administers, with those of the bodies under it.
  const ownPrograms = programsOf(o);
  const programsTab = ownPrograms.length
    ? `<section class="section" id="programs" data-tab-section="programs" aria-labelledby="programs-heading" hidden><h2 id="programs-heading">Programs</h2><ul class="search-results-list" aria-label="Programs">` +
      ownPrograms.map((p) => resultCard({ title: p.name, href: rel('organization', programUrl(p)), text: p.description && cleanText(p.description) })).join('') + '</ul></section>'
    : '';
  // The people who hold seats in this body.
  const seats = roles.filter((r) => r.memberOf && r.memberOf['@id'] === o['@id']);
  const peopleTab = seats.length
    ? `<section class="section" id="people" data-tab-section="people" aria-labelledby="people-heading" hidden><h2 id="people-heading">People</h2><ul class="search-results-list" aria-label="People">` +
      seats.map((r) => {
        const person = personById.get(r.member['@id']);
        const post = r.post && postById.get(r.post['@id']);
        const district = post && post.representsJurisdiction && jurById.get(post.representsJurisdiction['@id']);
        return resultCard({ badge: post && post.roleClassification ? post.roleClassification.charAt(0).toUpperCase() + post.roleClassification.slice(1) : '', title: person ? person.name : r.roleName,
          byline: [esc(r.roleName), district && esc(district.name), post && termLabel(post.termDuration) && esc(termLabel(post.termDuration))].filter(Boolean).join(' — ') });
      }).join('') + '</ul></section>'
    : '';
  // The budget book's figures for this body, when it has any.
  // The County itself has no tab until the book's countywide tables are read.
  const budgetTab = o.organizationClassification === 'government' ? '' : budget.organizationBudget(budgetData, o, kids, (c) => rel('organization', urlOf(c)), parent);
  const dataTabs = [subTab && [subId, subHeading], ownPrograms.length && ['programs', 'Programs'], budgetTab && ['budget', 'Budget'], seats.length && ['people', 'People']].filter(Boolean);

  const tabNav = `<nav id="app-nav" class="org-tabs" aria-label="Sections"><a href="#dashboard">Dashboard</a><a href="#about">About</a>${dataTabs.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}${related.map((r) => `<a href="#${esc(r.home.id)}">${esc(r.home.label)}</a>`).join('')}<a href="#data">Data</a><a href="#insights">Insights</a></nav>`;
  const toAttrs = (pairs) => pairs.filter(([, v]) => v != null).map(([k, v]) => `${k}="${esc(typeof v === 'string' ? v : JSON.stringify(v))}"`).join(' ');
  // Where a part of a tab reads its data from: its own address, or the tab's.
  const sourceOf = (r, stats, part) => {
    const src = part.src || stats.src;
    const base = part.dataBase || stats.dataBase || r.root;
    return srcOf(r, base, src);
  };
  const dataAttrs = (r, stats, part) => [['data-app-name', r.app.appName], ['data-src', sourceOf(r, stats, part)], ['data-records', part.records || stats.records],
    ['data-match', part.match || stats.match], ['data-value', (part.match || stats.match) ? r.value : null],
    ['data-exclude', part.exclude || stats.exclude], ['data-unique', part.unique || stats.unique], ['data-hidden-path', part.hiddenPath || stats.hiddenPath], ['data-hidden-text', part.hiddenText || stats.hiddenText]];
  // What a tab shows, without its section around it.
  const tabBody = (tab) => {
    const { r } = tab;
    const appLink = `<p><a href="${esc(tab.href)}">${esc(r.text)}</a></p>`;
    const c = tab.cfg;
    // An app with no data view yet gets its link as a card, until it has one.
    if (!c || c.kind === 'link') return `<div class="docs-grid"><article class="app-card"><span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${r.icon}</svg></span><h3><a href="${esc(tab.href)}">${esc(r.text)}</a></h3></article></div>`;
    if (c.kind === 'records') {
      const attrs = toAttrs([['data-app-name', r.app.appName], ['data-noun', c.noun], ['data-src', srcOf(r, c.dataBase || r.root, c.src)], ['data-records', c.records],
        ['data-exclude', c.exclude], ['data-unique', c.unique], ['data-empty-text', c.emptyText], ['data-columns', c.columns], ['data-hidden-path', c.hiddenPath], ['data-hidden-text', c.hiddenText],
        ['data-match', c.match], ['data-value', c.match ? r.value : null], ['data-title', c.title], ['data-link', c.link], ['data-link-template', c.linkTemplate && r.root + c.linkTemplate], ['data-meta', c.meta], ['data-badge', c.badge], ['data-text', c.text], ['data-sort', c.sort], ['data-timeframe', c.timeframe],
        ['data-group', c.group], ['data-group-link', c.groupLink && r.root + c.groupLink], ['data-group-date', c.groupDate], ['data-group-noun', c.groupNoun]]);
      return `<div data-record-list ${attrs}></div>${appLink}`;
    }
    // Stats: the numbers, then the charts, as the app lays them out.
    const parts = [];
    if (c.intro) parts.push(`<p>${esc(c.intro)}</p>`);
    if (c.kpis) {
      const k = c.kpis;
      const attrs = toAttrs([...dataAttrs(r, c, k), ['data-compute', k.compute], ['data-fields', k.fields]]);
      parts.push(`<div data-key-numbers ${attrs}></div>`);
    }
    if (c.charts && c.charts.length) {
      const cards = c.charts.map((chart) => `<div data-chart ${toAttrs([...dataAttrs(r, c, chart), ['data-chart-lib', '../vendor/chart.min.js'], ['data-chart-title', chart.title], ['data-kind', chart.kind],
        ['data-date', chart.date], ['data-bucket', chart.bucket], ['data-group', chart.group], ['data-sum', chart.sum], ['data-top', chart.top], ['data-empty-text', c.emptyText]])}></div>`).join('');
      parts.push(`<div class="mm-stats-grid">${cards}</div>`);
    }
    return parts.join('') + appLink;
  };
  // One tab per app. An app with more than one view has sub-tabs: Home, then its campaigns (Reach), then Stats.
  const tabSections = related.map((r) => {
    const id = r.home.id;
    const open = `<section class="section" id="${esc(id)}" data-tab-section="${esc(id)}" aria-labelledby="${esc(id)}-heading" hidden><h2 id="${esc(id)}-heading">${esc(r.home.label)}</h2>`;
    const views = [r.extra && [r.extra.label, r.extra], r.stats && ['Stats', r.stats]].filter(Boolean);
    if (!views.length) return `${open}${tabBody({ ...r.home, r })}</section>`;
    return `${open}<div data-subtabs><nav class="org-subtabs" data-subtabs-nav aria-label="${esc(r.home.label)} sections"><a href="#${esc(id)}">Home</a>${views.map(([label, v]) => `<a href="#${esc(v.id)}">${esc(label)}</a>`).join('')}</nav>` +
      `<div id="${esc(id)}-home" data-subtab>${tabBody({ ...r.home, r })}</div>` +
      views.map(([, v]) => `<div id="${esc(v.id)}" data-subtab hidden>${tabBody({ ...v, r })}</div>`).join('') + '</div></section>';
  }).join('');
  // Dashboard: a tight look at each of the other tabs, each with a link to the tab for more.
  // A card links to its tab for more; the Mentions card links out to Marin Mentions, on the past 60 days.
  const more = (id, label) => `<p class="org-dash__more"><a href="#${esc(id)}">${esc(label)}</a></p>`;
  const dashList = (items) => `<ul class="org-dash__list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  const SHOWN = 5;
  const dashParts = [];
  if (budgetTab) dashParts.push(`<section class="org-dash" aria-labelledby="dash-budget"><h2 id="dash-budget">Budget</h2>${budget.organizationKpis(budgetData, o, parent)}${budget.organizationTypeChart(budgetData, o)}${more('budget', 'Budget')}</section>`);
  if (seats.length) dashParts.push(`<section class="org-dash" aria-labelledby="dash-people"><h2 id="dash-people">People</h2>${dashList(seats.slice(0, SHOWN).map((r) => { const person = personById.get(r.member['@id']); return esc((person ? person.name : r.roleName) + (person ? ', ' + r.roleName : '')); }))}${more('people', 'People')}</section>`);
  for (const r of related) {
    if (r.app && r.app.id === 'links') continue; // Links has its tab, not a Dashboard section
    const c = r.home.cfg;
    const id = r.home.id;
    let inner;
    if (c && c.kind === 'records') {
      const attrs = toAttrs([['data-app-name', r.app.appName], ['data-noun', c.noun], ['data-src', srcOf(r, c.dataBase || r.root, c.src)], ['data-records', c.records],
        ['data-exclude', c.exclude], ['data-unique', c.unique], ['data-empty-text', c.emptyText], ['data-hidden-path', c.hiddenPath], ['data-hidden-text', c.hiddenText], ['data-limit', c.columns ? String(c.columns) : '3'], ['data-columns', c.columns],
        ['data-match', c.match], ['data-value', c.match ? r.value : null], ['data-title', c.title], ['data-link', c.link], ['data-link-template', c.linkTemplate && r.root + c.linkTemplate], ['data-meta', c.meta], ['data-badge', c.badge], ['data-text', c.text], ['data-sort', c.sort], ['data-timeframe', c.timeframe],
        ['data-group', c.group], ['data-group-link', c.groupLink && r.root + c.groupLink], ['data-group-date', c.groupDate], ['data-group-noun', c.groupNoun]]);
      inner = `<div data-record-list ${attrs}></div>`;
    } else inner = `<p><a href="${esc(r.home.href)}">${esc(r.text)}</a></p>`;
    // The first chart of the app's Stats sits above its records; hidden when there is nothing to draw.
    const sc = r.stats && r.stats.cfg;
    const lead = sc && sc.charts && sc.charts.length ? `<div class="mm-stats-grid"><div data-chart ${toAttrs([...dataAttrs(r, sc, sc.charts[0]), ['data-chart-lib', '../vendor/chart.min.js'], ['data-chart-title', sc.charts[0].title], ['data-kind', sc.charts[0].kind],
      ['data-date', sc.charts[0].date], ['data-bucket', sc.charts[0].bucket], ['data-group', sc.charts[0].group], ['data-sum', sc.charts[0].sum], ['data-top', sc.charts[0].top], ['data-hide-empty', '']])}></div></div>` : '';
    dashParts.push(`<section class="org-dash" aria-labelledby="dash-${esc(id)}"><h2 id="dash-${esc(id)}">${esc(r.home.label)}</h2>${lead}${inner}${r.app && r.app.id === 'mentions' ? `<p class="org-dash__more"><a href="${esc(r.home.href)}">${esc(r.text)}</a></p>` : more(id, r.home.label)}</section>`);
  }
  // Divisions and Programs come last, below the apps' records.
  dashParts.push(dashSection(subId, subHeading, kids, iconFor, (c) => rel('organization', urlOf(c))));
  dashParts.push(programsDash(ownPrograms, 'organization'));
  const dashboard = `<div id="dashboard" data-tab-section="dashboard" data-no-copy><div class="org-dashboard">${dashParts.join('')}</div></div>`;
  // A CSV for each table the page holds: its programs, and its budget figures.
  const csvs = [];
  if (ownPrograms.length) csvs.push({ id: 'programs', label: 'programs', rows: [['Program', 'Administered by', 'Description'], ...ownPrograms.map((p) => { const by = byId.get([].concat(p.administeredBy)[0]['@id']); return [p.name, by ? by.name : '', p.description ? cleanText(p.description) : '']; })] });
  if (budgetTab && o.organizationClassification !== 'government') csvs.push(...budget.organizationCsvs(budgetData, o, kids));
  // Copy, Link and Download follow the open tab: they act on it and show only what it has.
  const tabIds = ['about', subTab && subId, ownPrograms.length && 'programs', budgetTab && 'budget', seats.length && 'people', ...related.map((r) => r.home.id), 'data'].filter(Boolean);
  const jsonTabs = ['about', 'data', subTab && subId, ownPrograms.length && 'programs', budgetTab && 'budget'].filter(Boolean);
  csvs.forEach((c) => { c.tab = c.id === 'programs' ? 'programs' : 'budget'; });
  // Insights: this organization's structured data as a prompt for a chatbot.
  const insightSections = [{ id: 'about', label: 'About', data: {
    name: o.name, type: typeLabel(o), partOf: parent ? parent.name : undefined, areaServed: area ? area.name : undefined, website: o.url, telephone: o.telephone,
    address: o.address ? addressLine(o.address) : undefined, alsoKnownAs: o.alternateName, description: o.description ? cleanDescription(o.description) : undefined,
    mission: o.mission ? cleanMission(o.mission) : undefined, budgetDepartmentCode: budgetCode ? budgetCode.value : undefined, divisions: kids.length ? kids.map((k) => k.name) : undefined } }];
  if (seats.length) insightSections.push({ id: 'people', label: 'People', data: seats.map((r) => { const person = personById.get(r.member['@id']); return { name: person ? person.name : undefined, role: r.roleName }; }) });
  if (ownPrograms.length) insightSections.push({ id: 'programs', label: 'Programs', data: ownPrograms.map((p) => ({ name: p.name, administeredBy: (byId.get([].concat(p.administeredBy)[0]['@id']) || {}).name, description: p.description ? cleanText(p.description) : undefined, budget: (budget.programInsights(budgetData, p) || {})['by fund group'] })) });
  if (budgetTab) insightSections.push({ id: 'budget', label: 'Budget', data: budget.organizationInsights(budgetData, o, kids, parent) });
  const insightLive = related.filter((r) => r.app && ['mentions', 'reach', 'links'].includes(r.app.id)).map((r) => {
    const c = r.home.cfg;
    return { id: r.app.id, kind: r.app.id, label: { mentions: 'Mentions', reach: 'Reach engagements and campaigns', links: 'Links' }[r.app.id], url: srcOf(r, c.dataBase || r.root, c.src), path: c.records };
  });
  const insights = insightsTab({ subject: o.name, noun: 'organization', sections: insightSections, live: insightLive, scriptPath: './insights.js', budgetNote: budgetTab ? BUDGET_NOTE : ''});
  const head = `<article class="content"><h1 class="doc-title">${esc(o.name)}</h1>${tabNav}${actions(slugOf(o['@id']), 'article.content', true, csvs, { content: tabIds, json: jsonTabs })}`;
  const body = head + dashboard +
    '<div id="about" data-tab-section="about" hidden>' +
    `<section class="section" aria-labelledby="about-heading"><h2 id="about-heading">About</h2><dl class="org-facts">${overview.join('')}</dl></section>` +
    '</div>' + subTab + programsTab + budgetTab + peopleTab + tabSections +
    '<div id="data" data-tab-section="data" hidden>' +
    `<section class="section" aria-labelledby="identifiers"><h2 id="identifiers">Identifiers</h2><table><thead><tr><th scope="col">Name</th><th scope="col">Value</th><th scope="col">Scheme</th></tr></thead><tbody>${ids}</tbody></table></section>` +
    `<section class="section" aria-labelledby="record"><h2 id="record">Record</h2><dl class="org-facts">${record.join('')}</dl></section>` +
    `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul><li><a href="./data/organizations.jsonld">Organization data (JSON-LD)</a></li>${ownPrograms.length ? '<li><a href="./data/programs.jsonld">Program data (JSON-LD)</a></li>' : ''}${seats.length ? '<li><a href="./data/roles.jsonld">Role data (JSON-LD)</a>, <a href="./data/posts.jsonld">posts</a> and <a href="./data/people.jsonld">people</a></li>' : ''}</ul>${sources.budgetBook ? `<p>Descriptions, missions, programs and contacts come from the ${esc(sources.budgetBook.title)}.</p>` : ''}</section>` +
    jsonBlock({ about: [o], data: [o], ...(subTab ? { [subId]: kids } : {}), programs: ownPrograms, budget: budget.linesFor(budgetData, o['@id']) }, './page-data.js', csvs) + '</div>' + insights + '</article>';

  const crumbs = [['Marin Docs', '../index.html'], ['Organization', './index.html']];
  // The trail is the organization's own: a service area is a grouping, with its own section.
  if (parent && parent !== county && !isArea(parent)) crumbs.push([parent.name, rel('organization', urlOf(parent))]);
  crumbs.push([o.name, null]);
  return shell(o.name, o.description ? cleanDescription(o.description) : desc, crumbs, body, iconFor(o));
}

// ---- Service areas: a page for each, listing its programs ----
// A program card is its title (a link to its page) and its description.
const programCard = (p, from) => resultCard({ title: p.name, href: rel(from, programUrl(p)), text: p.description && cleanText(p.description) });
const areas = orgs.filter(isArea).sort(byOrgName);

function serviceAreasIndex() {
  const cards = areas.map((a) => {
    const n = programsOf(a).length;
    return `<article class="app-card app-card--secondary"><span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICON_LAYERS}</svg></span><h3><a href="./${areaSlug(a)}.html">${esc(a.name)}</a></h3><p>${n} ${n === 1 ? 'program' : 'programs'}</p></article>`;
  }).join('');
  const csvs = [{ id: 'table', label: 'service areas', rows: [['Service area', 'Programs'], ...areas.map((a) => [a.name, programsOf(a).length])] }];
  return shell('Service areas', 'The groups of departments that make up the County of Marin.', [['Marin Docs', '../index.html'], ['Service areas', null]],
    `<section class="hero"><h1>Service areas</h1><p class="lede">The groups of departments that make up the <a href="../organization/${page(county)}">${esc(county.name)}</a>, with the programs of each.</p>${actions('service-areas', '#main', false, csvs)}</section><section class="docs-grid" aria-label="Service areas">${cards}</section>` + jsonBlock(null, '../organization/page-data.js', csvs), ICON_LAYERS);
}

function serviceAreaPage(a) {
  const own = programsOf(a);
  // Its budget: the departments over three years, from the budget book.
  const b = budgetData ? budget.areaBudget(budgetData, a, { orgById: byId, orgHref: (o) => rel('service-areas', urlOf(o)) }) : null;
  const csvs = [{ id: 'table', label: 'programs', rows: [['Program', 'Administered by', 'Description'], ...own.map((p) => { const by = byId.get([].concat(p.administeredBy)[0]['@id']); return [p.name, by ? by.name : '', p.description ? cleanText(p.description) : '']; })] }];
  csvs[0].tab = 'programs';
  if (b) csvs[0].id = 'programs', csvs.push({ id: 'budget', label: 'budget', rows: [['Service area', 'Department or division', ...budget.YEARS.map((y) => y.label), 'Change', 'FTE'], ...b.csvRows], tab: 'budget' });
  const budgetTab = b
    ? `<section class="section" id="budget" data-tab-section="budget" aria-labelledby="budget-heading" hidden><h2 id="budget-heading">Budget</h2>` +
      `<div class="mm-stats-kpis">${budget.kpi('Expenditures, FY 2026-27', budget.millions(budget.val(b.totals[2])))}${b.ad ? budget.kpi('Full-time equivalent staff', budget.fteText(b.ad.sa.fte_fy2026_27)) : ''}</div>` +
      `<h3 id="budget-departments">Departments</h3>${b.chart}${b.table}` +
      budget.sourceList(budgetData, b.pages, [['Budget lines (JSON-LD)', budget.BUDGET_SITE + 'budget/data/budget-lines.jsonld']], 'Figures are whole dollars as printed; the final edition still labels FY 2026-27 as Proposed. Each program\'s own figures are on its page.') + '</section>'
    : '';
  // About: what the record says, and the departments in it.
  const kids = childrenOf(a);
  const aboutFacts = [row('Type', esc(typeLabel(a)))];
  if (parentOf(a)) aboutFacts.push(row('Part of', `<a href="${rel('service-areas', urlOf(parentOf(a)))}">${esc(parentOf(a).name)}</a>`));
  const where = a.areaServed && jurById.get(a.areaServed['@id']);
  if (where) aboutFacts.push(row('Area served', esc(where.name)));
  if (a.description) aboutFacts.push(row('Description', esc(cleanDescription(a.description))));
  if (a.mission) aboutFacts.push(row('Mission', esc(cleanMission(a.mission))));
  if (kids.length) aboutFacts.push(row('Departments', `<ul class="org-dash__list">${kids.map((k) => `<li><a href="${rel('service-areas', urlOf(k))}">${esc(k.name)}</a></li>`).join('')}</ul>`));
  const aboutTab = `<div id="about" data-tab-section="about" hidden><section class="section" aria-labelledby="about-heading"><h2 id="about-heading">About</h2><dl class="org-facts">${aboutFacts.join('')}</dl></section></div>`;
  // Dashboard: a tight look at the other tabs, each with a link. With no budget it shows About.
  const areaPrograms = programsDash(own, 'service-areas');
  const dashboard = `<div id="dashboard" data-tab-section="dashboard" data-no-copy><div class="org-dashboard">` + (b
    ? `<section class="org-dash" aria-labelledby="dash-budget"><h2 id="dash-budget">Budget</h2><div class="mm-stats-kpis">${budget.kpi('Expenditures, FY 2026-27', budget.millions(budget.val(b.totals[2])))}${b.ad ? budget.kpi('Full-time equivalent staff', budget.fteText(b.ad.sa.fte_fy2026_27)) : ''}</div><p class="org-dash__more"><a href="#budget">Budget</a></p></section>`
    : `<section class="org-dash" aria-labelledby="dash-about"><h2 id="dash-about">About</h2><dl class="org-facts">${aboutFacts.join('')}</dl><p class="org-dash__more"><a href="#about">About</a></p></section>`) + areaPrograms + `</div></div>`;
  const tabNav = `<nav id="app-nav" class="org-tabs" aria-label="Sections"><a href="#dashboard">Dashboard</a><a href="#about">About</a><a href="#programs">Programs</a>${b ? '<a href="#budget">Budget</a>' : ''}<a href="#data">Data</a><a href="#insights">Insights</a></nav>`;
  const insightSections = [{ id: 'about', label: 'About', data: { name: a.name, type: typeLabel(a), partOf: parentOf(a) ? parentOf(a).name : undefined, description: a.description ? cleanDescription(a.description) : undefined, departments: kids.map((k) => k.name) } },
    { id: 'programs', label: 'Programs', data: own.map((p) => ({ name: p.name, administeredBy: (byId.get([].concat(p.administeredBy)[0]['@id']) || {}).name, description: p.description ? cleanText(p.description) : undefined, budget: (budget.programInsights(budgetData, p) || {})['by fund group'] })) }];
  if (b) insightSections.push({ id: 'budget', label: 'Budget', data: budget.areaInsights(budgetData, b.csvRows) });
  const insights = insightsTab({ subject: a.name + ' service area', noun: 'service area', sections: insightSections, scriptPath: '../organization/insights.js', budgetNote: b ? BUDGET_NOTE : ''});
  const body = `<article class="content"><h1 class="doc-title">${esc(a.name)}</h1>${tabNav}${actions('service-area-' + areaSlug(a), 'article.content', true, csvs, { content: ['about', 'programs', b ? 'budget' : '', 'data'].filter(Boolean), json: ['about', 'programs', b ? 'budget' : '', 'data'].filter(Boolean) })}` +
    dashboard + aboutTab +
    `<section class="section" id="programs" data-tab-section="programs" aria-labelledby="programs-heading" hidden><h2 id="programs-heading">Programs</h2><ul class="search-results-list" aria-label="Programs">${own.map((p) => programCard(p, 'service-areas')).join('')}</ul></section>` +
    budgetTab +
    `<div id="data" data-tab-section="data" hidden><section class="section" aria-labelledby="record"><h2 id="record">Record</h2><dl class="org-facts">${row('Record id', `<code>${esc(a['@id'])}</code>`)}${row('Record type', `<code>${esc(a['@type'])}</code>`)}</dl></section>` +
    `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul><li><a href="../organization/data/organizations.jsonld">Organization data (JSON-LD)</a></li><li><a href="../organization/data/programs.jsonld">Program data (JSON-LD)</a></li>${b ? `<li><a href="${budget.BUDGET_SITE}budget/data/budget-lines.jsonld">Budget lines (JSON-LD)</a></li>` : ''}</ul>${sources.budgetBook ? `<p class="app-help-text">Descriptions and programs come from the ${esc(sources.budgetBook.title)}.</p>` : ''}</section></div>` +
    jsonBlock({ about: [a, ...kids], programs: own, budget: b ? budget.linesFor(budgetData, a['@id']) : [], data: [a] }, '../organization/page-data.js', csvs) + insights + '</article>';
  return shell(a.name, `Service area of the ${county.name}.`, [['Marin Docs', '../index.html'], ['Service areas', './index.html'], [a.name, null]], body, ICON_LAYERS);
}

// ---- Programs: a page for each ----
function programPage(p) {
  const by = [].concat(p.administeredBy).map((x) => byId.get(x['@id'])).filter(Boolean);
  const area = by.length && areaOf(by[0]);
  const where = p.areaServed && jurById.get(p.areaServed['@id']);
  const facts = [row('Administered by', by.map((x) => `<a href="${rel('programs', urlOf(x))}">${esc(x.name)}</a>`).join(', '))];
  if (area) facts.push(row('Service area', `<a href="${rel('programs', urlOf(area))}">${esc(area.name)}</a>`));
  if (where) facts.push(row('Area served', esc(where.name)));
  const record = [row('Record id', `<code>${esc(p['@id'])}</code>`), row('Record type', `<code>${esc(p['@type'])}</code>`)];
  if (p.programClassification) record.push(row('Classification', esc(fixLabel(typeof p.programClassification === 'string' ? p.programClassification : p.programClassification['@id'], orgNames))));
  // The trail follows the service area; a program outside any service area falls back to its agency.
  const crumbs = [['Marin Docs', '../index.html']];
  if (area) crumbs.push(['Service areas', '../service-areas/index.html'], [area.name, rel('programs', urlOf(area))]);
  else {
    crumbs.push(['Organization', '../organization/index.html']);
    if (by[0]) crumbs.push([by[0].name, rel('programs', urlOf(by[0]))]);
  }
  crumbs.push([p.name, null]);
  const budgetTab = budget.programBudget(budgetData, p, p.name, (id) => { const f = budgetData && budgetData.fundById.get(id); return f ? `${budget.BUDGET_SITE}budget/funds/${budget.fundSlug(f)}.html` : null; });
  const kpis = budget.programKpis(budgetData, p);
  const tabNav = `<nav id="app-nav" class="org-tabs" aria-label="Sections"><a href="#dashboard">Dashboard</a><a href="#about">About</a>${budgetTab ? '<a href="#budget">Budget</a>' : ''}<a href="#data">Data</a><a href="#insights">Insights</a></nav>`;
  // The Dashboard is a tight look at the other tabs, each with a link to the tab. A program with no figures in the book has only About.
  const dashboard = `<div id="dashboard" data-tab-section="dashboard"><div class="org-dashboard">` + (kpis
    ? `<section class="org-dash" aria-labelledby="dash-budget"><h2 id="dash-budget">Budget</h2>${kpis}<p class="org-dash__more"><a href="#budget">Budget</a></p></section>`
    : `<section class="org-dash" aria-labelledby="dash-about"><h2 id="dash-about">About</h2><dl class="org-facts">${facts.join('')}</dl><p class="org-dash__more"><a href="#about">About</a></p></section>`) + `</div></div>`;
  const rowsCsv = budgetTab ? budget.programCsv(budgetData, p) : null;
  const csvs = rowsCsv ? [{ id: 'table', label: 'budget', rows: rowsCsv, tab: 'budget' }] : [];
  const tabs = ['about', budgetTab && 'budget', 'data'].filter(Boolean);
  const insightSections = [{ id: 'about', label: 'About', data: { name: p.name, description: p.description ? cleanText(p.description) : undefined, administeredBy: by.map((x) => x.name), serviceArea: area ? area.name : undefined } }];
  if (budgetTab) insightSections.push({ id: 'budget', label: 'Budget', data: budget.programInsights(budgetData, p) });
  const insights = insightsTab({ subject: p.name + ' program', noun: 'program', sections: insightSections, scriptPath: '../organization/insights.js', budgetNote: budgetTab ? BUDGET_NOTE : ''});
  const body = `<article class="content"><h1 class="doc-title">${esc(p.name)}</h1>${tabNav}${actions(slugOf(p['@id']), 'article.content', true, csvs, { content: tabs, json: tabs })}` + dashboard +
    `<div id="about" data-tab-section="about" hidden><section class="section" aria-labelledby="about-heading"><h2 id="about-heading">About</h2><dl class="org-facts">${facts.join('')}${p.description ? row('Description', esc(cleanText(p.description))) : ''}</dl></section></div>` +
    budgetTab +
    `<div id="data" data-tab-section="data" hidden><section class="section" aria-labelledby="record"><h2 id="record">Record</h2><dl class="org-facts">${record.join('')}</dl></section>` +
    `<section class="section" aria-labelledby="source"><h2 id="source">Source</h2><ul><li><a href="../organization/data/programs.jsonld">Program data (JSON-LD)</a></li>${budgetTab ? `<li><a href="${budget.BUDGET_SITE}budget/data/budget-lines.jsonld">Budget lines (JSON-LD)</a></li>` : ''}</ul>${sources.budgetBook ? `<p class="app-help-text">Descriptions and programs come from the ${esc(sources.budgetBook.title)}.</p>` : ''}</section></div>` +
    jsonBlock({ about: [p], data: [p], budget: budgetTab ? (budgetData.byProgram.get(p['@id']) || []) : [] }, '../organization/page-data.js', csvs) + insights + '</article>';
  return shell(p.name, p.description ? cleanText(p.description) : `Program of the ${county.name}.`, crumbs, body);
}

fs.writeFileSync(path.join(OUT, 'index.html'), indexPage());
for (const o of orgs) if (!isArea(o)) fs.writeFileSync(path.join(OUT, page(o)), orgPage(o));

const AREAS = path.join(ROOT, 'service-areas');
const PROGRAMS = path.join(ROOT, 'programs');
for (const dir of [AREAS, PROGRAMS]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'styles.css'), '@import url("../organization/styles.css");\n');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(dir, f));
}
fs.writeFileSync(path.join(AREAS, 'index.html'), serviceAreasIndex());
for (const a of areas) fs.writeFileSync(path.join(AREAS, `${areaSlug(a)}.html`), serviceAreaPage(a));
const programSlugs = new Set();
for (const p of programs) {
  const s = slugOf(p['@id']);
  if (programSlugs.has(s)) throw new Error('Two programs share the page name ' + s);
  programSlugs.add(s);
  fs.writeFileSync(path.join(PROGRAMS, s + '.html'), programPage(p));
}
console.log(`Wrote organization/index.html, ${orgs.length - areas.length} organization pages, ${areas.length} service areas and ${programs.length} programs.`);
