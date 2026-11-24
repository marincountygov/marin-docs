// Which SOP pages are listed. The structured list (sop/sops.json) names the SOPs that are listed; the pages of the others stay in place
// but are left off every list: the SOP list, the topic pages, the left navigation and the search lists.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// The file names (in sop/) of the SOP pages whose JSON-LD @id is an item of the list in sop/sops.json.
function listedSopFiles() {
  const graph = JSON.parse(fs.readFileSync(path.join(ROOT, "sop/sops.json"), "utf8"))["@graph"];
  const ids = new Set(graph.filter((n) => n.itemListElement).flatMap((n) => n.itemListElement.map((i) => i.item["@id"])));
  return fs.readdirSync(path.join(ROOT, "sop")).filter((f) => f.endsWith(".html")).filter((f) => {
    const html = fs.readFileSync(path.join(ROOT, "sop", f), "utf8");
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return false;
    const data = JSON.parse(m[1]);
    const node = data["@id"] ? data : (data["@graph"] || []).find((n) => n["@id"]) || {};
    return ids.has(node["@id"]);
  }).sort();
}

module.exports = { listedSopFiles };
