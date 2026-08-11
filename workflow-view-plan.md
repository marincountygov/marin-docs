# Plan: SOP flow view — text/flow toggle, now upgraded to a real chart

Status: Phase 1 (text/flow toggle, linear vertical stepper) is implemented and live on all three SOP pages. This document now covers Phase 2: rendering the Flow view as an actual branching flowchart for SOPs that have real decision points, using the schema drafted in `sops_with_decision_tree.json`. Phase 2 is plan only — not implemented.

## Why revisit this

The current Flow view (shipped) renders every SOP as a single vertical chain of steps, grouped by section. That's an honest picture for a strictly linear SOP, but two of the three SOPs actually branch — a step can lead to different next steps depending on a yes/no condition (see the Fleet purchasing SOP: "new addition" vs. "replacement" send you down different step sequences that later reconverge). A vertical chain can't show that. A chart can.

## How to adapt the JSON: the target schema

The attached draft (`sops_with_decision_tree.json`) is the right shape. Before I build against it, here's what I'd tighten up and why — this is the schema I'd actually implement:

### 1. One workflow-level node per SOP, unchanged in spirit

```json
"marin:workflow": {
  "@type": "marin:Workflow",
  "marin:workflowType": "branching-decision-tree | conditional-workflow | procedure-library",
  "marin:entryStep": { "@id": "#step-1" },
  "marin:entrySteps": [{ "@id": "#step-1" }, { "@id": "#step-2" }, "..."],
  "marin:completionStep": { "@id": "#step-8" },
  "description": "How this metadata was derived from the source SOP."
}
```

**Rule to make explicit and enforce:** exactly one of `marin:entryStep` (single) or `marin:entrySteps` (array) is present, and which one is determined by `workflowType`:

- `branching-decision-tree` and `conditional-workflow` → single `marin:entryStep` + `marin:completionStep`. There's one real start and one real end, even though the path between them branches.
- `procedure-library` → `marin:entrySteps` (plural), no `marin:completionStep`. This is the Roads SOP: it's not one flow, it's several independent maintenance procedures grouped by section. Forcing that into one chart would misrepresent the source document.

**This directly decides how each SOP renders**, and it's the most important call in this plan:

| workflowType | Rendering |
|---|---|
| `branching-decision-tree`, `conditional-workflow` | New chart view (this document) |
| `procedure-library` | Keep the existing vertical-stepper/swimlane view already shipped — it's already the correct shape for "several independent procedures," and building a fake unified graph would be worse, not better |

So the Roads SOP's Flow view doesn't change. Only Fleet purchasing and Airfield inspection move to a chart.

### 2. Per-step edges: exactly one of three states

Every `HowToStep` ends in exactly one of:

```json
"marin:nextStep": { "@id": "#step-2" }
```
— a plain step, one way forward —
```json
"marin:decision": {
  "@type": "marin:Decision",
  "question": "Is the purchase a new fleet addition or a replacement?",
  "options": [
    {
      "label": "New fleet addition",
      "condition": "A department or division requests an addition to the fleet.",
      "marin:outcome": "optional — what to do",
      "marin:nextStep": { "@id": "#step-2" }
    }
  ]
}
```
— a branch point —
```json
"marin:terminalNode": true
```
— the end of a path.

**Two real gaps in the draft data that the chart needs to render deliberately, not paper over:**

- **Converging branches**: Airfield step-3's decision ("Can the hazard be addressed immediately?") has *both* Yes and No pointing at step-4. That's valid — the decision affects what you *do*, not where you go next — but the chart must draw two labeled arrows into the same node, not collapse them into one.
- **Dead-end branches**: Fleet step-2's "No" option has no `marin:nextStep` at all — the source SOP just doesn't say what happens if the department and Fleet Manager don't agree. The chart needs a visibly distinct node for this ("Not specified in source" — dashed border, muted, not styled like a real terminal), so it reads as a documented gap, not a bug.

**Rule to add:** every option without a `marin:nextStep` should also not claim `marin:terminalNode` — it's neither "continues" nor "ends," it's "undocumented." The renderer needs a third node style for this, distinct from both action nodes and the real completion node.

### 3. Rename `marin:decisionPoints` → `marin:conditionalNotes`

The plural `marin:decisionPoints` (used in the Roads SOP, e.g. "Is crack sealing required?") is doing something different from singular `marin:decision`: it never carries a `nextStep`, so it doesn't affect graph topology at all — it's descriptive detail about a choice embedded *inside* one step's text, not a branch in the flow. Keeping the same "Decision" `@type` and a confusingly similar field name for two structurally different things will cause bugs later (someone will eventually try to graph it). Renaming makes the distinction unambiguous: `marin:decision` (singular) changes where you go; `marin:conditionalNotes` (renamed from `decisionPoints`) is just annotation, surfaced as an optional expandable note on the node, never as a graph edge.

### 4. Keep `marin:nodeType`, but don't trust it alone

`nodeType: "decision"` is a useful authored cross-check, but the renderer should determine "is this a decision node" structurally — by checking for a `marin:decision` object — not by string-matching `nodeType`. That way a data-entry mismatch (nodeType says "action" but a `marin:decision` object is present) is something we can actually detect and flag, rather than silently trusting whichever one gets checked first.

### 5. Minor data-completeness note

Fleet step-2's "No" option has no `condition` string (every other option does). Not a schema problem, just something to fill in when this data actually gets authored into the live JSON-LD — the chart will otherwise show a blank condition line for that one branch.

## Building the graph from the data

1. **Flatten across sections.** Edges cross `HowToSection` boundaries (Fleet step-3, in section "Request and approve the purchase," points to step-4, in section "Issue the purchase order..."). Build one `stepsById` map across *all* sections before doing anything else — don't assume a section is a self-contained subgraph for branching SOPs. (It genuinely is self-contained for `procedure-library` SOPs, which is exactly why those stay on the swimlane view.)
2. **Rank the nodes.** From `marin:entryStep`, do a topological pass (Kahn's algorithm, since the schema is a DAG — see open question below) where `rank[node] = max(rank[predecessor] + 1)` across all incoming edges. This is what correctly places a reconverging node like Airfield step-4 *after* both of its sources, automatically.
3. **Order within a rank.** For graphs this small (max ~8 nodes, mostly binary branches), a simple barycenter heuristic — order each rank's nodes by the average lane-position of their predecessors, falling back to original `position` for ties — is enough. No need for a real crossing-minimization algorithm.
4. **Lay out with CSS Grid**, not absolute pixel math: `grid-row` = rank, `grid-column` = lane. The browser handles box sizing and text wrapping; we only compute row/column assignment.
5. **Draw edges as an SVG overlay**, sized to the grid container, positioned after layout via `getBoundingClientRect()` on the actual rendered nodes (same trick already used for the shipped vertical-connector code, generalized to arbitrary node-to-node routing). Each edge is an orthogonal (elbow) path with an arrowhead and, for decision edges, a small text label at the midpoint (the option's `label`, e.g. "Yes" / "New fleet addition"). Recompute on resize and whenever a node's expand/collapse changes its height.

## Node visual language

- **Action node** — same rounded rectangle + numbered badge already shipped.
- **Decision node** — same rectangle shape (not a literal rotated diamond — real diamonds fight with variable-length question text and are awkward to make legible/accessible), but with a distinct accent border/icon so it visually reads as "a question," plus the question text instead of a step title.
- **Terminal node** — pill shape, reuses the green `.app-status` treatment already shipped for the Status badge ("Complete").
- **Undocumented branch** — dashed border, muted color, "Not specified in source" — visually and semantically distinct from both of the above.

## Accessibility: the chart is a progressive enhancement, not the source of truth

A spatial diagram can't be the only way to get this information — so the plan is to make the underlying markup fully accessible on its own, with the visual chart layered on top:

- **DOM order = topological order**, so keyboard/AT navigation through the chart lands on nodes in a sequence that already makes sense without seeing the diagram.
- **Every branch is a real link**, not just a visual arrow: each decision option renders as `<a href="#step-N">Yes — go to "Send the purchase order to the vendor"</a>` inside the node's expandable detail. A screen-reader or keyboard user can literally follow the branch logic by activating links, independent of the SVG.
- **SVG connectors are `aria-hidden="true"`** — decorative only. The real relationship is the link text above.
- **Text view is untouched** and remains what prints (`@media print` already forces it regardless of toggle state) — it's still the fully linear, no-JS-required fallback for every SOP, chart-eligible or not.

## Implementation phases

1. **Data**: update the live embedded JSON-LD on the Fleet and Airfield SOP pages to the refined schema above (add `nodeType`/`decision`/`nextStep`/`terminalNode` per step, add the `marin:workflow` block). Roads SOP JSON-LD gets `marin:workflow` too (type `procedure-library`, `entrySteps`), but no per-step edge fields, since it keeps the existing view.
2. **Graph builder**: pure-JS module that takes the parsed JSON-LD and returns `{ nodes, edges, ranks }` — flatten, rank, order. No DOM in this step, so it's independently testable.
3. **Renderer**: CSS Grid layout + SVG overlay, extending `sop/flow-view.js`. `renderFlow()` branches on `workflowType`: `procedure-library` keeps calling the existing swimlane renderer unchanged; the other two types call the new chart renderer.
4. **Styles**: new node/edge/label rules in `sop/styles.css`, alongside the existing flow-node styles (which stay, for the swimlane path).

## Open questions before I build this

- **Hand-rolled layout vs. vendoring a graph library** (e.g. Mermaid): recommend hand-rolled. These graphs are small (≤10 nodes, mostly binary branches), and the project's own standard (`marinappsbrand/SPEC.md`) avoids adding dependencies unless materially justified — a full layout engine is a lot of weight for graphs this size. Flag if you'd rather have Mermaid's more polished rendering and are fine adding it as a vendored dependency.
- **Acyclic assumption**: none of the three SOPs currently loop back to an earlier step. The rank algorithm above assumes a DAG. If a future SOP genuinely needs a loop (e.g., "recheck and repeat until resolved"), the ranking approach needs a different rule for back-edges — worth confirming this is fine to defer.
- **Where do `marin:conditionalNotes` (renamed from `decisionPoints`) show up?** Recommend: an optional small expandable note inside the node detail, same place as Responsible role / Completion criteria — not part of the graph at all. Confirm that's the right amount of visibility for something that's descriptive-only.
