(() => {
  const tablist = document.querySelector(".view-toggle");
  const textView = document.getElementById("text-view");
  const flowView = document.getElementById("flow-view");
  if (!tablist || !textView || !flowView) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  function activate(view, { focus = false } = {}) {
    const target = view === "flow" ? "flow" : "text";
    tabs.forEach((tab) => {
      const selected = tab.dataset.view === target;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    textView.hidden = target !== "text";
    flowView.hidden = target !== "flow";
    if (target === "flow") drawChartEdges();

    const url = new URL(window.location.href);
    if (target === "flow") url.searchParams.set("view", "flow");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
      activate(tabs[nextIndex].dataset.view, { focus: true });
    });
  });

  function roleNamesFrom(role) {
    if (!role) return "";
    if (Array.isArray(role)) return role.map((r) => r.roleName).filter(Boolean).join(", ");
    return role.roleName || "";
  }

  function addDetailRow(detail, label, value) {
    if (!value) return;
    const dl = document.createElement("dl");
    dl.className = "mini-dl";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
    detail.appendChild(dl);
  }

  // ---------- Swimlane renderer (procedure-library: independent procedures, no real chaining) ----------

  function renderSwimlane(data) {
    const sections = Array.isArray(data.step) ? data.step : [];
    const frag = document.createDocumentFragment();

    sections.forEach((section) => {
      const group = document.createElement("section");
      group.className = "flow-group";

      const title = document.createElement("h3");
      title.className = "flow-group__title";
      title.textContent = section.name || "";
      group.appendChild(title);

      const list = document.createElement("ol");
      list.className = "flow-nodes";

      const items = Array.isArray(section.itemListElement) ? section.itemListElement : [];
      items.forEach((step) => {
        const node = document.createElement("li");
        node.className = "flow-node";

        const rail = document.createElement("div");
        rail.className = "flow-node__rail";
        rail.setAttribute("aria-hidden", "true");
        const num = document.createElement("span");
        num.className = "step-num";
        num.textContent = String(step.position ?? "");
        rail.appendChild(num);

        const body = document.createElement("div");
        body.className = "flow-node__body";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "flow-node__toggle";
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = step.name || "";

        const detail = document.createElement("div");
        detail.className = "flow-node__detail";
        detail.hidden = true;

        if (step.text) {
          const text = document.createElement("p");
          text.textContent = step.text;
          detail.appendChild(text);
        }

        addDetailRow(detail, "Responsible role", roleNamesFrom(step["marin:responsibleRole"]));
        addDetailRow(detail, "Completion criteria", step["marin:completionCriteria"]);
        addDetailRow(detail, "Required record", step["marin:requiredRecord"]);

        toggle.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          detail.hidden = expanded;
        });

        body.append(toggle, detail);
        node.append(rail, body);
        list.appendChild(node);
      });

      group.appendChild(list);
      frag.appendChild(group);
    });

    flowView.appendChild(frag);
  }

  // ---------- Chart renderer (branching-decision-tree, conditional-workflow) ----------

  function idFrom(ref) {
    return ref && ref["@id"] ? ref["@id"] : null;
  }

  function slugFrom(fullId) {
    const hash = fullId.indexOf("#");
    return "chart-" + (hash >= 0 ? fullId.slice(hash + 1) : fullId).replace(/[^a-zA-Z0-9-]/g, "-");
  }

  // Every step resolves to zero or more outgoing edges: from marin:decision options,
  // or a single marin:nextStep, or none (terminal / undocumented).
  function stepEdges(step) {
    if (step["marin:decision"]) {
      const options = Array.isArray(step["marin:decision"].options) ? step["marin:decision"].options : [];
      return options.map((opt) => ({
        label: opt.label || "",
        condition: opt.condition || "",
        outcome: opt["marin:outcome"] || "",
        targetId: idFrom(opt["marin:nextStep"]),
      }));
    }
    const next = idFrom(step["marin:nextStep"]);
    return next ? [{ label: "", condition: "", outcome: "", targetId: next }] : [];
  }

  function buildStepIndex(data) {
    const stepsById = new Map();
    const sections = Array.isArray(data.step) ? data.step : [];
    sections.forEach((section) => {
      const items = Array.isArray(section.itemListElement) ? section.itemListElement : [];
      items.forEach((step) => {
        stepsById.set(step["@id"], { ...step, sectionName: section.name });
      });
    });
    return stepsById;
  }

  // Rank = longest path length from the entry step. Iterative relaxation handles
  // reconverging branches correctly (a node's rank is the MAX of all predecessors + 1)
  // without needing a strict topological sort up front. Assumes an acyclic graph.
  function computeRanks(stepsById, entryId) {
    const rank = new Map([[entryId, 0]]);
    const ids = Array.from(stepsById.keys());
    for (let pass = 0; pass <= ids.length; pass++) {
      let changed = false;
      stepsById.forEach((step, id) => {
        if (!rank.has(id)) return;
        const r = rank.get(id);
        stepEdges(step).forEach((edge) => {
          if (!edge.targetId || !stepsById.has(edge.targetId)) return;
          if (!rank.has(edge.targetId) || rank.get(edge.targetId) < r + 1) {
            rank.set(edge.targetId, r + 1);
            changed = true;
          }
        });
      });
      if (!changed) break;
    }
    return rank;
  }

  // Order nodes within a rank by the average lane of their predecessors (barycenter),
  // falling back to source `position` order. Good enough for graphs this small.
  function computeLanes(stepsById, rank) {
    const byRank = new Map();
    rank.forEach((r, id) => {
      if (!byRank.has(r)) byRank.set(r, []);
      byRank.get(r).push(id);
    });
    const lane = new Map();
    const maxRank = Math.max(...rank.values());

    (byRank.get(0) || []).forEach((id, i) => lane.set(id, i));

    for (let r = 1; r <= maxRank; r++) {
      const nodes = byRank.get(r) || [];
      const scored = nodes.map((id) => {
        const preds = [];
        stepsById.forEach((step, sourceId) => {
          if (rank.get(sourceId) !== r - 1) return;
          stepEdges(step).forEach((edge) => {
            if (edge.targetId === id) preds.push(lane.get(sourceId) ?? 0);
          });
        });
        const avg = preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : 0;
        const originalPosition = stepsById.get(id)?.position ?? 0;
        return { id, avg, originalPosition };
      });
      scored.sort((a, b) => a.avg - b.avg || a.originalPosition - b.originalPosition);
      scored.forEach((s, i) => lane.set(s.id, i));
    }
    return { lane, byRank, maxRank };
  }

  function buildNodeEl({ className, gridRow, gridColumn, id }) {
    const el = document.createElement("div");
    el.className = "chart-node " + className;
    el.style.gridRow = String(gridRow);
    el.style.gridColumn = String(gridColumn);
    if (id) el.id = id;
    return el;
  }

  function renderChart(data) {
    const stepsById = buildStepIndex(data);
    const workflow = data["marin:workflow"] || {};
    const entryId = idFrom(workflow["marin:entryStep"]);
    if (!entryId || !stepsById.has(entryId)) {
      // Fall back to the swimlane view if the workflow metadata is missing or malformed.
      renderSwimlane(data);
      return;
    }

    const rank = computeRanks(stepsById, entryId);
    const { lane, byRank, maxRank } = computeLanes(stepsById, rank);

    const legend = document.createElement("p");
    legend.className = "chart-legend";
    legend.appendChild(document.createTextNode("Rectangle = action"));
    [
      ["decision", "gold border = decision"],
      ["terminal", "green = complete"],
      ["undocumented", "dashed = not specified in source"],
    ].forEach(([kind, text]) => {
      const swatch = document.createElement("span");
      swatch.className = "chart-legend__swatch chart-legend__swatch--" + kind;
      swatch.setAttribute("aria-hidden", "true");
      legend.appendChild(swatch);
      legend.appendChild(document.createTextNode(text));
    });
    flowView.appendChild(legend);

    const chart = document.createElement("div");
    chart.className = "flow-chart";

    // Track synthetic "undocumented" placeholder nodes (edges whose option has no marin:nextStep).
    let undocumentedCount = 0;
    const laneWidthByRank = new Map();
    byRank.forEach((ids, r) => laneWidthByRank.set(r, ids.length));
    // Built alongside node/placeholder creation below, in one pass, so a placeholder's id
    // is always available when its edge is recorded (rather than recomputed from stepEdges()
    // a second time, which would return fresh objects with no memory of the placeholder id).
    const paintableEdges = [];

    stepsById.forEach((step, id) => {
      if (!rank.has(id)) return; // unreachable from entry; skip rather than guess a position
      const r = rank.get(id);
      const c = lane.get(id) ?? 0;
      const isDecision = Boolean(step["marin:decision"]);
      const isTerminal = Boolean(step["marin:terminalNode"]);

      const nodeEl = buildNodeEl({
        className: isTerminal ? "chart-node--terminal" : isDecision ? "chart-node--decision" : "chart-node--action",
        gridRow: r + 1,
        gridColumn: c + 1,
        id: slugFrom(id),
      });
      nodeEl.tabIndex = -1;

      if (isTerminal) {
        const status = document.createElement("span");
        status.className = "app-status";
        status.dataset.status = "success";
        status.textContent = "Complete";
        const label = document.createElement("span");
        label.className = "chart-node__title";
        label.textContent = step.name || "";
        nodeEl.append(status, label);
      } else {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "chart-node__toggle";
        toggle.setAttribute("aria-expanded", "false");

        const num = document.createElement("span");
        num.className = "step-num";
        num.setAttribute("aria-hidden", "true");
        num.textContent = String(step.position ?? "");

        const label = document.createElement("span");
        label.className = "chart-node__title";
        label.textContent = step.name || "";

        toggle.append(num, label);

        if (isDecision) {
          const mark = document.createElement("span");
          mark.className = "chart-node__decision-mark";
          mark.setAttribute("aria-hidden", "true");
          mark.textContent = "?";
          toggle.appendChild(mark);
        }

        const detail = document.createElement("div");
        detail.className = "chart-node__detail";
        detail.hidden = true;

        if (step.text) {
          const text = document.createElement("p");
          text.textContent = step.text;
          detail.appendChild(text);
        }

        addDetailRow(detail, "Responsible role", roleNamesFrom(step["marin:responsibleRole"]));
        addDetailRow(detail, "Completion criteria", step["marin:completionCriteria"]);
        addDetailRow(detail, "Required record", step["marin:requiredRecord"]);

        const edges = stepEdges(step);
        if (isDecision && edges.length) {
          const question = document.createElement("p");
          question.className = "chart-node__question";
          question.textContent = step["marin:decision"].question || "";
          detail.appendChild(question);

          const branchList = document.createElement("ul");
          branchList.className = "chart-node__branches";
          edges.forEach((edge) => {
            const li = document.createElement("li");
            if (edge.targetId && stepsById.has(edge.targetId)) {
              const targetStep = stepsById.get(edge.targetId);
              const link = document.createElement("a");
              link.href = "#" + slugFrom(edge.targetId);
              const strong = document.createElement("strong");
              strong.textContent = edge.label || "Continue";
              link.append(strong, document.createTextNode(" — " + (targetStep.name || "next step")));
              link.addEventListener("click", () => {
                const targetToggle = document.getElementById(slugFrom(edge.targetId))?.querySelector(".chart-node__toggle");
                if (targetToggle && targetToggle.getAttribute("aria-expanded") !== "true") targetToggle.click();
              });
              li.appendChild(link);
              if (edge.condition) {
                const cond = document.createElement("span");
                cond.className = "chart-node__condition";
                cond.textContent = " (" + edge.condition + ")";
                li.appendChild(cond);
              }
            } else {
              const strong = document.createElement("strong");
              strong.textContent = edge.label || "Continue";
              li.append(strong, document.createTextNode(" — not specified in source"));
            }
            branchList.appendChild(li);
          });
          detail.appendChild(branchList);
        }

        toggle.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          detail.hidden = expanded;
          drawChartEdges();
        });

        nodeEl.append(toggle, detail);
      }

      chart.appendChild(nodeEl);

      // Record this node's outgoing edges for the SVG paint pass, creating a dashed
      // placeholder node for any branch whose option has no marin:nextStep.
      if (!isTerminal) {
        stepEdges(step).forEach((edge) => {
          if (edge.targetId && stepsById.has(edge.targetId)) {
            paintableEdges.push({ from: slugFrom(id), to: slugFrom(edge.targetId), label: edge.label });
            return;
          }
          if (edge.targetId) return; // points outside this document; nothing to draw
          if (!isDecision) return; // a plain nextStep is always resolved or absent (terminal)

          undocumentedCount += 1;
          const placeholderRank = r + 1;
          const width = laneWidthByRank.get(placeholderRank) || 0;
          laneWidthByRank.set(placeholderRank, width + 1);
          const placeholder = buildNodeEl({
            className: "chart-node--undocumented",
            gridRow: placeholderRank + 1,
            gridColumn: width + 1,
            id: "chart-undocumented-" + undocumentedCount,
          });
          const label = document.createElement("span");
          label.className = "chart-node__title";
          label.textContent = "Not specified in source";
          placeholder.appendChild(label);
          chart.appendChild(placeholder);

          paintableEdges.push({ from: slugFrom(id), to: placeholder.id, label: edge.label });
        });
      }
    });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "flow-chart__edges");
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "flow-chart-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto-start-reverse");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M0,0 L10,5 L0,10 z");
    arrowPath.setAttribute("class", "flow-chart__arrowhead");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    chart.appendChild(svg);
    flowView.appendChild(chart);

    // paintableEdges was built above, in the same pass as node/placeholder creation.
    flowView.__chartEdges = paintableEdges;
    flowView.__chartEl = chart;
  }

  function drawChartEdges() {
    const chart = flowView.__chartEl;
    const edges = flowView.__chartEdges;
    if (!chart || !edges || flowView.hidden) return;

    const svg = chart.querySelector(".flow-chart__edges");
    if (!svg) return;
    Array.from(svg.querySelectorAll("path.flow-chart__edge, text")).forEach((el) => el.remove());

    const containerRect = chart.getBoundingClientRect();
    svg.setAttribute("width", String(chart.scrollWidth));
    svg.setAttribute("height", String(chart.scrollHeight));
    svg.setAttribute("viewBox", `0 0 ${chart.scrollWidth} ${chart.scrollHeight}`);

    // A label placed at a fixed fraction of the path (e.g. always the midpoint, or always
    // near the source) collides with a sibling label whenever several edges share that same
    // endpoint: a fork (one source, several targets) needs labels spread near the targets,
    // which differ in position; a merge (several sources, one target) needs labels spread
    // near the sources instead, since the target position is identical for all of them.
    const fanOut = new Map();
    const fanIn = new Map();
    const parallelKey = ({ from, to }) => from + "→" + to;
    const parallelGroups = new Map();
    edges.forEach((edge) => {
      fanOut.set(edge.from, (fanOut.get(edge.from) || 0) + 1);
      fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
      const key = parallelKey(edge);
      if (!parallelGroups.has(key)) parallelGroups.set(key, []);
      parallelGroups.get(key).push(edge);
    });

    edges.forEach((edgeData) => {
      const { from, to, label } = edgeData;
      const fromEl = document.getElementById(from);
      const toEl = document.getElementById(to);
      if (!fromEl || !toEl) return;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Two options on the same decision can both lead to the same next step (a decision
      // can affect what you do without affecting where you go next). Those edges are
      // otherwise geometrically identical — same endpoints — so without an offset they'd
      // draw as one line with labels stacked exactly on top of each other.
      const group = parallelGroups.get(parallelKey(edgeData));
      const parallelIndex = group.indexOf(edgeData);
      const parallelSpread = (parallelIndex - (group.length - 1) / 2) * 22;

      const x1 = fromRect.left - containerRect.left + fromRect.width / 2 + chart.scrollLeft;
      const y1 = fromRect.bottom - containerRect.top + chart.scrollTop;
      const x2 = toRect.left - containerRect.left + toRect.width / 2 + chart.scrollLeft;
      const y2 = toRect.top - containerRect.top + chart.scrollTop;
      const midY = (y1 + y2) / 2;
      const bowX1 = x1 + parallelSpread;
      const bowX2 = x2 + parallelSpread;

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "flow-chart__edge");
      path.setAttribute("marker-end", "url(#flow-chart-arrow)");
      path.setAttribute("d", `M${x1},${y1} C${bowX1},${midY} ${bowX2},${midY} ${x2},${y2}`);
      svg.appendChild(path);

      if (label) {
        const outCount = fanOut.get(from) || 1;
        const inCount = fanIn.get(to) || 1;
        let t = 0.5;
        if (outCount > 1 && outCount >= inCount) t = 0.72; // fork: spread labels near the (differing) targets
        else if (inCount > 1) t = 0.28; // merge: spread labels near the (differing) sources

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "flow-chart__edge-label");
        text.setAttribute("x", String(x1 + (x2 - x1) * t + 6 + parallelSpread));
        text.setAttribute("y", String(y1 + (y2 - y1) * t));
        text.textContent = label;
        svg.appendChild(text);
      }
    });
  }

  let resizeScheduled = false;
  window.addEventListener("resize", () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    window.requestAnimationFrame(() => {
      resizeScheduled = false;
      drawChartEdges();
    });
  });

  // ---------- Dispatch ----------

  function render() {
    if (flowView.dataset.rendered) return;
    const script = document.querySelector('script[type="application/ld+json"]');
    if (!script) return;

    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      return;
    }

    const workflowType = data["marin:workflow"]?.["marin:workflowType"];
    if (workflowType === "branching-decision-tree" || workflowType === "conditional-workflow") {
      renderChart(data);
    } else {
      renderSwimlane(data);
    }
    flowView.dataset.rendered = "true";
  }

  render();

  const params = new URLSearchParams(window.location.search);
  activate(params.get("view") === "flow" ? "flow" : "text");
})();
