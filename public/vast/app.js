(() => {
  "use strict";

  const manifest = window.VA_MANIFEST;
  if (!manifest) throw new Error("Analysis manifest did not load.");

  const NS = "http://www.w3.org/2000/svg";
  const allRoundRange = { start: 0, end: manifest.rounds.length - 1 };
  const agentOrder = [
    "Legal-Agent",
    "Social-Manager-Agent",
    "PR-Intern-Agent",
    "Intern-Agent",
    "Platform-Trust-Agent",
    "PR-Agent",
    "Judge-Agent"
  ].filter((agent) => manifest.agents.includes(agent));
  const channelOrder = [
    "comms_huddle",
    "side_huddle",
    "one_on_one_chat",
    "personal_post",
    "anonymous_post",
    "official_post"
  ].filter((channel) => manifest.channels.includes(channel));
  const agentColors = {
    "Legal-Agent": "#6555a5",
    "Social-Manager-Agent": "#a64c79",
    "PR-Intern-Agent": "#0b8075",
    "Intern-Agent": "#087a98",
    "Platform-Trust-Agent": "#957309",
    "PR-Agent": "#356ca0",
    "Judge-Agent": "#3c7a46",
    "Environment context": "#66747a"
  };
  const patternColors = {
    allMessages: "#53666e",
    publicPosts: "#6f7f86",
    releaseActions: "#9a680d",
    outsideJudgeRecipients: "#bd5b50",
    activeChannels: "#68767c",
    judgeChannels: "#16827d",
    preliftDisclosures: "#b3263d"
  };
  const patternOrder = [
    "allMessages",
    "preliftDisclosures",
    "releaseActions",
    "outsideJudgeRecipients",
    "judgeChannels",
    "publicPosts",
    "activeChannels"
  ];
  const patternShortLabels = {
    allMessages: "All messages",
    publicPosts: "Public posts",
    releaseActions: "Release actions",
    outsideJudgeRecipients: "Release · no Judge",
    activeChannels: "Active channels",
    judgeChannels: "Judge channels",
    preliftDisclosures: "Pre-lift disclosure"
  };
  const pathLensLabels = {
    release: "Public confirmation",
    decisions: "Command language",
    control: "Restriction language",
    coordination: "Non-shared channels"
  };
  const pathLensRules = {
    release: new Set(["public_disclosure"]),
    decisions: new Set(["authority_signal", "publish_command"]),
    control: new Set(["restriction_signal"]),
    coordination: new Set(["non_shared_coordination"])
  };
  const transitionLensRules = {
    release: new Set(["third_party_publication", "prelift_disclosure", "embargo_lift"]),
    decisions: new Set(["asserted_authority", "explicit_command"]),
    control: new Set(["restriction", "concurrence_request"]),
    coordination: new Set(["staged", "private_coordination"])
  };
  const pathLensColors = {
    release: "#b3263d",
    decisions: "#9a680d",
    control: "#16827d",
    coordination: "#68767c"
  };
  const channelLabels = {
    comms_huddle: "Comms Huddle",
    side_huddle: "Side Huddle",
    one_on_one_chat: "1:1 Chat",
    personal_post: "Personal Post",
    anonymous_post: "Anonymous Post",
    official_post: "Official Post",
    round_context: "Environment"
  };
  const channelShortLabels = {
    comms_huddle: "Comms",
    side_huddle: "Side",
    one_on_one_chat: "1:1",
    personal_post: "Personal",
    anonymous_post: "Anon.",
    official_post: "Official"
  };
  const recipientAgents = {
    platform_trust: "Platform-Trust-Agent",
    pr: "PR-Agent",
    social_manager: "Social-Manager-Agent",
    legal: "Legal-Agent",
    intern: "Intern-Agent",
    pr_intern: "PR-Intern-Agent",
    judge: "Judge-Agent"
  };
  const recordById = new Map(manifest.records.map((record) => [record.id, record]));
  const transitionById = new Map(
    manifest.transitions.map((transition) => [transition.id, transition])
  );
  const candidateClusterById = new Map();
  const relationById = new Map(
    manifest.relations.map((relation) => [relation.id, relation])
  );
  const termByName = new Map(manifest.terms.map((term) => [term.term, term]));
  const candidateRuleLabels = new Map(
    manifest.actionCandidates.map((candidate) => [
      candidate.ruleId,
      candidate.label
    ])
  );
  const candidateMessageIds = new Set(
    manifest.actionCandidates
      .filter((candidate) => candidate.channel !== "round_context")
      .map((candidate) => candidate.sourceId)
  );
  const preliftDisclosureCandidates = manifest.actionCandidates
    .filter(
      (candidate) =>
        candidate.ruleId === "public_disclosure" &&
        new Date(candidate.timestamp) < new Date(manifest.liftTimestamp)
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const preliftDisclosureBySource = new Map(
    preliftDisclosureCandidates.map((candidate) => [candidate.sourceId, candidate])
  );
  const state = {
    focus: "all",
    editRange: "A",
    ranges: {
      A: { ...manifest.ranges.A },
      B: { ...manifest.ranges.B }
    },
    rangeHistory: [],
    people: new Set(agentOrder),
    channels: new Set(channelOrder),
    grouping: "people",
    highlightLens: "release",
    supportView: "activity",
    selection: null,
    drilledRecord: null,
    evidenceRecordLimit: 10,
    evidenceRecordMode: "all",
    termVisibleCount: null,
    termCompact: null,
    hoveredTerm: null,
    hoveredPathKey: null,
    hoveredPathRecordIds: new Set(),
    drag: null
  };
  let termScopeCache = null;
  let suppressTimelineClickUntil = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const svgEl = (name, attributes = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
    return node;
  };
  const addSvgText = (svg, text, attributes = {}) => {
    const node = svgEl("text", attributes);
    node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  const escapeRegExp = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function literalSpans(content, variants = []) {
    const text = String(content || "");
    const spans = [];
    [...new Set(variants.filter(Boolean))].forEach((variant) => {
      const matcher = new RegExp(
        `(^|[^A-Za-z0-9])(${escapeRegExp(variant)})(?=$|[^A-Za-z0-9])`,
        "gi"
      );
      for (const match of text.matchAll(matcher)) {
        const start = match.index + match[1].length;
        spans.push({
          start,
          end: start + match[2].length,
          text: match[2]
        });
      }
    });
    return spans;
  }
  function ruleSpansForRecord(recordId) {
    const selection = state.selection;
    if (!selection || !recordId) return [];
    if (selection.kind === "anchor") {
      return selection.sourceId === recordId
        ? preliftDisclosureBySource.get(recordId)?.matchSpans || []
        : [];
    }
    if (selection.kind === "transition") {
      const transition = transitionById.get(selection.id);
      return transition?.sourceId === recordId ? transition.matchSpans || [] : [];
    }
    if (selection.kind === "candidate") {
      const cluster = candidateClusterById.get(selection.id);
      if (!cluster) return [];
      const members = cluster.members.filter(
        (member) => member.sourceId === recordId
      );
      const emphasized = members.filter((member) =>
        pathLensRules[state.highlightLens].has(member.ruleId)
      );
      return (emphasized.length ? emphasized : members).flatMap(
        (member) => member.matchSpans || []
      );
    }
    if (selection.kind === "relation") {
      const relation = relationById.get(selection.id);
      const target = transitionById.get(relation?.target);
      return target?.sourceId === recordId ? relation.targetMatchSpans || [] : [];
    }
    if (
      selection.kind === "pattern" &&
      selection.metric === "preliftDisclosures"
    ) {
      return preliftDisclosureBySource.get(recordId)?.matchSpans || [];
    }
    return [];
  }
  function highlightedExcerpt(content, ruleSpans = [], selectedTerm = null) {
    const text = String(content || "");
    const flags = Array.from({ length: text.length }, () => 0);
    const applySpans = (spans, flag) => {
      spans.forEach(({ start, end }) => {
        const low = clamp(Number(start) || 0, 0, text.length);
        const high = clamp(Number(end) || 0, low, text.length);
        for (let index = low; index < high; index += 1) flags[index] |= flag;
      });
    };
    (manifest.referenceTerms || []).forEach((entry) => {
      applySpans(literalSpans(text, entry.variants), 1);
    });
    const hoveredVariants = state.hoveredTerm
      ? manifest.termVariants?.[state.hoveredTerm] || [state.hoveredTerm]
      : [];
    applySpans(literalSpans(text, hoveredVariants), 2);
    const selectedVariants = selectedTerm
      ? manifest.termVariants?.[selectedTerm] || [selectedTerm]
      : [];
    applySpans(literalSpans(text, selectedVariants), 4);
    applySpans(ruleSpans, 4);

    let html = "";
    let index = 0;
    const used = { reference: false, hover: false, rule: false };
    while (index < text.length) {
      const flag = flags[index];
      let end = index + 1;
      while (end < text.length && flags[end] === flag) end += 1;
      const segment = escapeHtml(text.slice(index, end));
      if (!flag) {
        html += segment;
      } else {
        const classes = [];
        if (flag & 1) {
          classes.push("is-reference");
          used.reference = true;
        }
        if (flag & 2) {
          classes.push("is-hovered-term");
          used.hover = true;
        }
        if (flag & 4) {
          classes.push("is-rule-match");
          if (state.selection?.kind === "anchor") {
            classes.push("is-confirmed-public");
          }
          used.rule = true;
        }
        html += `<mark class="evidence-highlight ${classes.join(" ")}">${segment}</mark>`;
      }
      index = end;
    }
    return { html, used };
  }
  function evidenceLegendHtml(used) {
    const entries = [];
    if (used.rule) {
      entries.push('<span><i class="key-rule"></i>Selected rule or term</span>');
    }
    if (used.hover) {
      entries.push('<span><i class="key-hover"></i>Term under pointer</span>');
    }
    if (used.reference) {
      entries.push('<span><i class="key-reference"></i>Reference term</span>');
    }
    return entries.length
      ? `<div class="evidence-highlight-legend" aria-label="Text highlight meanings">${entries.join(
          ""
        )}</div>`
      : "";
  }
  function evidenceExcerptHtml(content, recordId, explicitRuleSpans = null) {
    const selectedTerm =
      state.selection?.kind === "term" ? state.selection.term : null;
    const result = highlightedExcerpt(
      content,
      explicitRuleSpans || ruleSpansForRecord(recordId),
      selectedTerm
    );
    return `${evidenceLegendHtml(
      result.used
    )}<blockquote class="evidence-content">${result.html}</blockquote>`;
  }
  const readableAgent = (agent) =>
    String(agent || "Unknown")
      .replace(/-Agent$/, "")
      .replaceAll("-", " ");
  const readableChannel = (channel) => channelLabels[channel] || channel;
  const agentPillHtml = (agent, label = readableAgent(agent)) => {
    const color = agentColors[agent] || agentColors["Environment context"];
    return `<span class="agent-pill" style="--agent-color:${escapeHtml(
      color
    )}">${escapeHtml(label)}</span>`;
  };
  const agentPillsHtml = (agents) =>
    [...new Set(agents)]
      .map((agent) => agentPillHtml(agent))
      .join(" ");
  const recipientsHtml = (recipients = []) => {
    if (!recipients.length) return "Not applicable";
    return `<span class="recipient-list">${recipients
      .map((recipient) =>
        recipientAgents[recipient]
          ? agentPillHtml(recipientAgents[recipient])
          : `<span>${escapeHtml(recipient === "ALL" ? "All" : recipient)}</span>`
      )
      .join("")}</span>`;
  };
  const allPeopleSelected = () => state.people.size === agentOrder.length;
  const allChannelsSelected = () => state.channels.size === channelOrder.length;
  const filtersAreSubset = () =>
    !allPeopleSelected() || !allChannelsSelected();
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const month = date.toLocaleString("en", { month: "short" });
    const day = date.getDate();
    const time = date.toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return `${month} ${day} · ${time}`;
  };
  const formatClock = (timestamp) =>
    new Date(timestamp).toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  const formatTimeSpan = (startTimestamp, endTimestamp = startTimestamp) => {
    if (!endTimestamp || startTimestamp === endTimestamp) {
      return formatTime(startTimestamp);
    }
    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    if (start.toDateString() === end.toDateString()) {
      return `${formatTime(startTimestamp)}–${formatClock(endTimestamp)}`;
    }
    return `${formatTime(startTimestamp)}–${formatTime(endTimestamp)}`;
  };
  const rangeLabel = (range) => {
    const start = new Date(manifest.rounds[range.start].timestamp);
    const end = new Date(manifest.rounds[range.end].timestamp);
    const sameDay = start.toDateString() === end.toDateString();
    const left = start.toLocaleDateString("en", { month: "short", day: "numeric" });
    if (sameDay) {
      return `${left} · ${formatClock(start.toISOString())}–${formatClock(end.toISOString())}`;
    }
    const right = end.toLocaleDateString("en", { month: "short", day: "numeric" });
    return `${left}–${right}`;
  };
  const focusRange = () =>
    state.focus === "all" ? allRoundRange : state.ranges[state.focus];
  const indicesIn = (range) =>
    Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
  const inRange = (index, range = focusRange()) =>
    index >= range.start && index <= range.end;
  const sameSelection = (selection) =>
    state.selection &&
    selection.kind === state.selection.kind &&
    Object.keys(selection).every((key) => state.selection[key] === selection[key]);

  function baseRoundWeight(index) {
    if (index <= 12) return 0.18 / 13;
    if (index <= 20) return 0.42 / 8;
    if (index === 21) return 0.3;
    return 0.1;
  }

  function boundaryPositions(range = allRoundRange) {
    const weights = indicesIn(range).map(baseRoundWeight);
    const total = weights.reduce((sum, value) => sum + value, 0);
    const positions = [0];
    let running = 0;
    weights.forEach((weight) => {
      running += weight / total;
      positions.push(running);
    });
    return positions;
  }

  function boundaryPosition(boundaryIndex, range = allRoundRange) {
    if (boundaryIndex <= range.start) return 0;
    if (boundaryIndex >= range.end + 1) return 1;
    return boundaryPositions(range)[boundaryIndex - range.start];
  }

  function roundIndexForTime(timestamp) {
    const target = new Date(timestamp).getTime();
    let index = 0;
    manifest.rounds.forEach((round, candidate) => {
      if (new Date(round.timestamp).getTime() <= target) index = candidate;
    });
    return index;
  }

  function timePosition(timestamp, range = focusRange()) {
    const index = clamp(roundIndexForTime(timestamp), range.start, range.end);
    const startTime = new Date(manifest.rounds[index].timestamp).getTime();
    const nextTime =
      index < manifest.rounds.length - 1
        ? new Date(manifest.rounds[index + 1].timestamp).getTime()
        : startTime + 60 * 60 * 1000;
    const fraction = clamp(
      (new Date(timestamp).getTime() - startTime) / Math.max(1, nextTime - startTime),
      0,
      1
    );
    const positions = boundaryPositions(range);
    const localIndex = index - range.start;
    return positions[localIndex] + (positions[localIndex + 1] - positions[localIndex]) * fraction;
  }

  function pathTimePosition(timestamp, range = focusRange()) {
    const position = timePosition(timestamp, range);
    const liftPosition = timePosition(manifest.liftTimestamp, range);
    if (range.end === manifest.rounds.length - 1 && liftPosition > 0) {
      return clamp(position / liftPosition, 0, 1);
    }
    return position;
  }

  function recordPassesFilters(record) {
    if (!record) return false;
    const isContext =
      record.actor === "Environment context" || record.channel === "round_context";
    if (!isContext && !state.people.has(record.actor)) return false;
    if (!isContext && !state.channels.has(record.channel)) return false;
    return inRange(record.roundIndex);
  }

  function transitionPassesFilters(transition) {
    if (!inRange(transition.roundIndex)) return false;
    if (
      transition.actor !== "Environment context" &&
      !state.people.has(transition.actor)
    ) return false;
    if (
      transition.channel !== "round_context" &&
      !state.channels.has(transition.channel)
    ) return false;
    return true;
  }

  function candidatePassesFilters(candidate) {
    if (!inRange(candidate.roundIndex)) return false;
    if (
      candidate.actor !== "Environment context" &&
      !state.people.has(candidate.actor)
    ) return false;
    if (
      candidate.channel !== "round_context" &&
      !state.channels.has(candidate.channel)
    ) return false;
    return true;
  }

  function setSelection(selection, options = {}) {
    state.selection = sameSelection(selection) && options.toggle !== false ? null : selection;
    state.drilledRecord = null;
    state.evidenceRecordLimit = 10;
    state.evidenceRecordMode = "all";
    renderSelectionOnly();
  }

  function selectionFocusSelector(selection = state.selection) {
    if (!selection) return null;
    if (selection.kind === "anchor") {
      return `[data-anchor="${selection.sourceId}"]`;
    }
    if (selection.kind === "candidate") {
      return `[data-candidate="${selection.id}"]`;
    }
    if (selection.kind === "transition") {
      return `[data-transition="${selection.id}"]`;
    }
    if (selection.kind === "relation") {
      return `[data-relation="${selection.id}"][role="button"]`;
    }
    if (selection.kind === "term") {
      return `[data-term="${selection.term}"]`;
    }
    if (selection.kind === "activity") {
      return `[data-activity-agent="${selection.agent}"][data-activity-channel="${selection.channel}"]`;
    }
    if (selection.kind === "pattern") {
      return `[data-pattern="${selection.metric}"][data-round-index="${selection.roundIndex}"]`;
    }
    return null;
  }

  function clearSelection() {
    if (!state.selection && !state.drilledRecord) return;
    state.selection = null;
    state.drilledRecord = null;
    state.evidenceRecordLimit = 10;
    state.evidenceRecordMode = "all";
    renderSelectionOnly();
  }

  function resetTermPaging() {
    state.termVisibleCount = null;
    termScopeCache = null;
  }

  function timeStateSnapshot() {
    return {
      A: { ...state.ranges.A },
      B: { ...state.ranges.B },
      editRange: state.editRange,
      focus: state.focus
    };
  }

  function pushRangeHistory(snapshot = timeStateSnapshot()) {
    state.rangeHistory.push({
      A: { ...snapshot.A },
      B: { ...snapshot.B },
      editRange: snapshot.editRange,
      focus: snapshot.focus ?? state.focus
    });
    if (state.rangeHistory.length > 30) state.rangeHistory.shift();
  }

  function setRange(
    key,
    start,
    end,
    recordHistory = true,
    historySnapshot = null
  ) {
    const low = clamp(Math.min(start, end), 0, manifest.rounds.length - 1);
    const high = clamp(Math.max(start, end), 0, manifest.rounds.length - 1);
    const current = state.ranges[key];
    if (current.start === low && current.end === high) return;
    if (recordHistory) pushRangeHistory(historySnapshot || timeStateSnapshot());
    state.ranges[key] = { start: low, end: high };
    resetTermPaging();
    renderAll();
  }

  function activateTimelineRange(key, { toggle = true } = {}) {
    if (!["A", "B"].includes(key)) return;
    const nextFocus = toggle && state.focus === key ? "all" : key;
    if (state.focus === nextFocus && state.editRange === key) return;
    pushRangeHistory();
    state.focus = nextFocus;
    state.editRange = key;
    state.selection = null;
    state.drilledRecord = null;
    state.evidenceRecordMode = "all";
    resetTermPaging();
    renderAll();
  }

  function focusLabel() {
    if (state.focus === "all") return `All ${manifest.rounds.length} rounds`;
    return `Range ${state.focus} · ${rangeLabel(state.ranges[state.focus])}`;
  }

  function renderControls() {
    $$("[data-focus]").forEach((button) => {
      const active = button.dataset.focus === state.focus;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-edit]").forEach((button) => {
      const active = button.dataset.edit === state.editRange;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-group]").forEach((button) => {
      const active = button.dataset.group === state.grouping;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-lens]").forEach((button) => {
      const active = button.dataset.lens === state.highlightLens;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $(".path-view")?.style.setProperty(
      "--current-lens-color",
      pathLensColors[state.highlightLens]
    );
    const compactSupport = window.matchMedia("(max-width: 1180px)").matches;
    $$("[data-support]").forEach((button) => {
      const active = button.dataset.support === state.supportView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-support-panel]").forEach((panel) => {
      panel.hidden =
        compactSupport && panel.dataset.supportPanel !== state.supportView;
    });
    $("#rangeALabel").textContent = rangeLabel(state.ranges.A);
    $("#rangeBLabel").textContent = rangeLabel(state.ranges.B);
    $("#rangeACount").textContent = state.ranges.A.end - state.ranges.A.start + 1;
    $("#rangeBCount").textContent = state.ranges.B.end - state.ranges.B.start + 1;
    const undoRange = $("#undoRange");
    const undoAvailable = state.rangeHistory.length > 0;
    undoRange.disabled = !undoAvailable;
    undoRange.classList.toggle("is-available", undoAvailable);
    $("#timeScopeStatus").textContent = `Showing ${focusLabel().toLowerCase()} · adjusting Range ${state.editRange}`;
    $("#clearEvidence").hidden = !state.selection && !state.drilledRecord;
    $("#clearPattern").hidden = state.selection?.kind !== "pattern";
    $$("[data-select-all='people']").forEach((button) => {
      button.hidden = allPeopleSelected();
    });
    $$("[data-select-all='channels']").forEach((button) => {
      button.hidden = allChannelsSelected();
    });
  }

  function renderFilterChips() {
    const peopleRoot = $("#peopleFilters");
    peopleRoot.innerHTML = agentOrder
      .map(
        (agent) =>
          `<button type="button" data-person="${escapeHtml(
            agent
          )}" class="person-filter ${
            state.people.has(agent) ? "is-active" : ""
          }" aria-pressed="${state.people.has(agent)}" style="--chip-color:${
            agentColors[agent]
          }">${escapeHtml(readableAgent(agent))}</button>`
      )
      .join("");
    const channelsRoot = $("#channelFilters");
    channelsRoot.innerHTML = channelOrder
      .map(
        (channel) =>
          `<button type="button" data-channel="${escapeHtml(
            channel
          )}" class="channel-filter ${
            state.channels.has(channel) ? "is-active" : ""
          }" aria-pressed="${state.channels.has(channel)}">${escapeHtml(
            readableChannel(channel)
          )}</button>`
      )
      .join("");
  }

  function renderTimeline() {
    const svg = $("#sharedTimeline");
    const width = Math.max(560, svg.clientWidth || 900);
    const height = Math.max(64, svg.clientHeight || 66);
    const margin = { left: 10, right: 10 };
    const plotWidth = width - margin.left - margin.right;
    const axisY = height - 20;
    const labelY = height - 5;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const xBoundary = (index) =>
      margin.left + boundaryPosition(index, allRoundRange) * plotWidth;

    const focus = focusRange();
    if (state.focus !== "all") {
      const x1 = xBoundary(focus.start);
      const x2 = xBoundary(focus.end + 1);
      svg.appendChild(
        svgEl("rect", {
          x: x1,
          y: 1,
          width: Math.max(2, x2 - x1),
          height: height - 5,
          class: "timeline-window",
          rx: 3
        })
      );
    }

    ["A", "B"].forEach((key, rowIndex) => {
      const range = state.ranges[key];
      const y = 3 + rowIndex * 17;
      const x1 = xBoundary(range.start);
      const x2 = xBoundary(range.end + 1);
      const group = svgEl("g", {
        "data-range-band": key,
        role: "button",
        tabindex: state.editRange === key ? "0" : "-1",
        "aria-label": `Range ${key}, ${rangeLabel(range)}. Drag to move.`
      });
      group.appendChild(
        svgEl("rect", {
          x: x1,
          y,
          width: Math.max(3, x2 - x1),
          height: 13,
          rx: 2,
          class: `range-band timeline-range-${key.toLowerCase()}`
        })
      );
      addSvgText(group, key, {
        x: x1 + 4,
        y: y + 10,
        class: "svg-small",
        "pointer-events": "none"
      });
      ["start", "end"].forEach((edge) => {
        const x = edge === "start" ? x1 : x2;
        group.appendChild(
          svgEl("rect", {
            x: x - 5,
            y: y - 2,
            width: 10,
            height: 17,
            rx: 3,
            fill: "transparent",
            class: "range-handle",
            "data-range-handle": edge,
            "data-range-key": key,
            "aria-hidden": "true"
          })
        );
        group.appendChild(
          svgEl("line", {
            x1: x,
            x2: x,
            y1: y + 2,
            y2: y + 11,
            stroke: key === "A" ? "var(--range-a)" : "var(--range-b)",
            "stroke-width": 2,
            "pointer-events": "none"
          })
        );
      });
      svg.appendChild(group);
    });

    const maxMessages = Math.max(...manifest.rounds.map((round) => round.messageCount));
    manifest.rounds.forEach((round, index) => {
      const x1 = xBoundary(index);
      const x2 = xBoundary(index + 1);
      const x = (x1 + x2) / 2;
      const barHeight = 3 + (round.messageCount / maxMessages) * 8;
      svg.appendChild(
        svgEl("rect", {
          x: x - Math.min(2.5, Math.max(1, (x2 - x1) * 0.16)),
          y: axisY - barHeight,
          width: Math.min(5, Math.max(2, (x2 - x1) * 0.32)),
          height: barHeight,
          rx: 1,
          class: `round-density ${inRange(index) ? "is-in-focus" : ""}`
        })
      );
    });
    svg.appendChild(
      svgEl("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: axisY,
        y2: axisY,
        class: "svg-axis"
      })
    );
    [13, 21].forEach((boundary) => {
      const x = xBoundary(boundary);
      svg.appendChild(
        svgEl("path", {
          d: `M ${x - 7} ${axisY} l 4 -4 l 6 8 l 4 -4`,
          class: "fold-mark"
        })
      );
    });

    addSvgText(svg, "May 17–Jun 4", {
      x: (xBoundary(0) + xBoundary(13)) / 2,
      y: labelY,
      class: "timeline-time-label",
      "text-anchor": "middle"
    });
    [
      { index: 13, label: "Jun 5 · 09:00", anchor: "start", offset: 8 },
      { index: 15, label: "11:00", anchor: "middle", offset: 0 },
      { index: 17, label: "13:00", anchor: "middle", offset: 0 },
      { index: 19, label: "15:00", anchor: "middle", offset: 0 },
      { index: 21, label: "17:00", anchor: "middle", offset: 0 },
      { index: 22, label: "18:00", anchor: "middle", offset: 0 }
    ].forEach(({ index, label, anchor, offset }) => {
      const x = xBoundary(index);
      svg.appendChild(
        svgEl("line", {
          x1: x,
          x2: x,
          y1: axisY + 1,
          y2: axisY + 5,
          class: "timeline-tick"
        })
      );
      addSvgText(svg, label, {
        x: x + offset,
        y: labelY,
        class: "timeline-time-label",
        "text-anchor": anchor
      });
    });
  }

  function filteredTermCount(term) {
    const entry = termByName.get(term);
    if (!entry) return { count: 0, records: [] };
    const records = [];
    let count = 0;
    Object.entries(entry.recordCounts).forEach(([id, occurrences]) => {
      const record = recordById.get(id);
      if (recordPassesFilters(record)) {
        count += occurrences;
        records.push(record);
      }
    });
    return { count, records };
  }

  function pathRecordIdsForSelection(selection = state.selection) {
    if (!selection) return [];
    if (selection.kind === "candidate") {
      return candidateClusterById.get(selection.id)?.sourceIds || [];
    }
    if (selection.kind === "transition") {
      const transition = transitionById.get(selection.id);
      return transition?.sourceId ? [transition.sourceId] : [];
    }
    if (selection.kind === "anchor") {
      return selection.sourceId ? [selection.sourceId] : [];
    }
    return [];
  }

  function linkedPathRecordsForTerms() {
    const selected = pathRecordIdsForSelection();
    if (selected.length) {
      return { sourceIds: new Set(selected), mode: "selection" };
    }
    return {
      sourceIds: new Set(state.hoveredPathRecordIds),
      mode: state.hoveredPathRecordIds.size ? "hover" : null
    };
  }

  function termOccurrencesInRecords(term, sourceIds) {
    const entry = termByName.get(term);
    if (!entry || !sourceIds.size) return 0;
    return [...sourceIds].reduce(
      (sum, sourceId) => sum + (entry.recordCounts[sourceId] || 0),
      0
    );
  }

  function activeLinkedTerm() {
    if (state.selection?.kind === "term") return state.selection.term;
    return state.hoveredTerm;
  }

  function sourcesContainActiveTerm(sourceIds) {
    const term = activeLinkedTerm();
    const entry = term ? termByName.get(term) : null;
    if (!entry) return { active: false, linked: false, persistent: false };
    return {
      active: true,
      linked: sourceIds.some((sourceId) => Boolean(entry.recordCounts[sourceId])),
      persistent: state.selection?.kind === "term"
    };
  }

  function termThreshold() {
    const range = focusRange();
    const roundCount = range.end - range.start + 1;
    if (roundCount <= 2) return 4;
    if (roundCount <= 4) return 6;
    if (roundCount <= 8) return 8;
    return 10;
  }

  function scopedTermEntries() {
    if (termScopeCache) return termScopeCache;
    const threshold = termThreshold();
    const entries = manifest.terms
      .map((entry) => ({ ...entry, filtered: filteredTermCount(entry.term) }))
      .filter((entry) => entry.filtered.count >= threshold)
      .sort(
        (a, b) =>
          b.filtered.count - a.filtered.count || a.term.localeCompare(b.term)
      );
    termScopeCache = { entries, threshold };
    return termScopeCache;
  }

  function termButtonHtml(entry, context) {
    const ratio =
      context.max === context.min
        ? 0.5
        : (entry.filtered.count - context.min) / (context.max - context.min);
    const size = 1 + ratio * 0.65;
    const linkedOccurrences = termOccurrencesInRecords(
      entry.term,
      context.pathLink.sourceIds
    );
    const linked = linkedOccurrences > 0;
    const classes = [
      context.selectedTerm === entry.term ? "is-selected" : "",
      linked ? `is-path-linked is-path-linked-${context.pathLink.mode}` : "",
      context.pathLink.mode && !linked ? "is-path-dimmed" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const linkDescription = linked
      ? `; ${linkedOccurrences} occurrence${
          linkedOccurrences === 1 ? "" : "s"
        } in the ${
          context.pathLink.mode === "selection" ? "selected" : "hovered"
        } path mark`
      : "";
    return `<button type="button" data-term="${escapeHtml(
      entry.term
    )}" class="${classes}" style="--term-size:${size.toFixed(
      2
    )}rem;--term-weight:${
      620 + Math.round(ratio * 140)
    }" aria-pressed="${
      context.selectedTerm === entry.term
    }" aria-label="${escapeHtml(entry.term)}, ${
      entry.filtered.count
    } occurrences${linkDescription}" title="${
      entry.filtered.count
    } occurrences${linkDescription}">${escapeHtml(
      entry.term
    )}<span class="term-count" aria-hidden="true">${
      entry.filtered.count
    }</span></button>`;
  }

  function renderTerms() {
    const root = $("#termCloud");
    const compact = (root.clientWidth || 700) < 520;
    const baseCount = compact ? 8 : 12;
    if (state.termCompact !== compact) {
      state.termCompact = compact;
      state.termVisibleCount = baseCount;
    }
    if (state.termVisibleCount === null) state.termVisibleCount = baseCount;
    const { entries: eligibleEntries, threshold } = scopedTermEntries();
    const entries = eligibleEntries.slice(0, state.termVisibleCount);
    const selectedTerm =
      state.selection?.kind === "term" ? state.selection.term : null;
    if (selectedTerm && !entries.some((entry) => entry.term === selectedTerm)) {
      const entry = termByName.get(selectedTerm);
      const filtered = filteredTermCount(selectedTerm);
      if (entry && filtered.count) entries.push({ ...entry, filtered });
    }
    const max = Math.max(
      1,
      ...eligibleEntries.map((entry) => entry.filtered.count)
    );
    const min = Math.min(
      ...eligibleEntries.map((entry) => entry.filtered.count),
      max
    );
    const pathLink = linkedPathRecordsForTerms();
    const context = { max, min, pathLink, selectedTerm };
    root.innerHTML = entries
      .map((entry) => termButtonHtml(entry, context))
      .join("");
    const shown = Math.min(state.termVisibleCount, eligibleEntries.length);
    $("#termStatus").textContent = `${shown} of ${
      eligibleEntries.length
    } · ≥${threshold} occurrences${filtersAreSubset() ? " · filtered" : ""}`;
    $("#loadMoreTerms").hidden = shown >= eligibleEntries.length;
  }

  function loadNextTermRow() {
    const root = $("#termCloud");
    const { entries } = scopedTermEntries();
    const current = Math.min(state.termVisibleCount || 0, entries.length);
    if (current >= entries.length) return;
    const max = Math.max(1, ...entries.map((entry) => entry.filtered.count));
    const min = Math.min(...entries.map((entry) => entry.filtered.count), max);
    const measure = document.createElement("div");
    measure.className = "term-cloud term-row-measure";
    measure.style.inlineSize = `${root.clientWidth}px`;
    const probeEntries = entries.slice(0, Math.min(entries.length, current + 32));
    measure.innerHTML = probeEntries
      .map((entry) =>
        termButtonHtml(entry, {
          max,
          min,
          pathLink: { sourceIds: new Set(), mode: null },
          selectedTerm: null
        })
      )
      .join("");
    document.body.appendChild(measure);
    const buttons = $$("button", measure);
    const lastVisibleTop = buttons[Math.max(0, current - 1)]?.offsetTop ?? -1;
    const nextRowTop =
      buttons.slice(current).find((button) => button.offsetTop > lastVisibleTop)
        ?.offsetTop ?? buttons[current]?.offsetTop;
    let nextCount = current;
    buttons.forEach((button, index) => {
      if (button.offsetTop <= nextRowTop) nextCount = index + 1;
    });
    measure.remove();
    state.termVisibleCount = Math.max(current + 1, nextCount);
    renderTerms();
    requestAnimationFrame(() => {
      root.scrollTo({ top: root.scrollHeight, behavior: "smooth" });
    });
  }

  function laneDefinitions(candidates, transitions) {
    const observed = new Set([
      ...candidates.map((candidate) => candidateLane(candidate)),
      ...transitions.map((transition) => transitionLane(transition))
    ]);
    if (state.grouping === "channels") {
      const usedChannels = channelOrder.filter((channel) =>
        state.channels.has(channel)
      );
      const lanes = usedChannels.map((channel) => ({
        key: channel,
        label: readableChannel(channel),
        color: "#68767c"
      }));
      if (observed.has("round_context")) {
        lanes.push({ key: "round_context", label: "Environment", color: "#68767c" });
      }
      return lanes;
    }
    const usedAgents = agentOrder.filter((agent) => state.people.has(agent));
    const lanes = usedAgents.map((agent) => ({
      key: agent,
      label: readableAgent(agent),
      color: agentColors[agent]
    }));
    if (observed.has("Environment context")) {
      lanes.push({
        key: "Environment context",
        label: "Environment",
        color: "#68767c"
      });
    }
    return lanes;
  }

  function transitionLane(transition) {
    return state.grouping === "channels" ? transition.channel : transition.actor;
  }

  function candidateLane(candidate) {
    return state.grouping === "channels" ? candidate.channel : candidate.actor;
  }

  function clusterCandidates(candidates) {
    const clusters = new Map();
    candidates.forEach((candidate) => {
      const lane = candidateLane(candidate);
      const id = [
        "candidate-cluster",
        state.grouping,
        candidate.roundIndex,
        lane
      ].join(":");
      if (!clusters.has(id)) {
        clusters.set(id, {
          id,
          label: "Record cluster",
          roundIndex: candidate.roundIndex,
          lane,
          timestamp: candidate.timestamp,
          members: []
        });
      }
      const cluster = clusters.get(id);
      cluster.members.push(candidate);
      if (new Date(candidate.timestamp) < new Date(cluster.timestamp)) {
        cluster.timestamp = candidate.timestamp;
      }
    });
    return [...clusters.values()]
      .map((cluster) => {
        const ruleCounts = {};
        cluster.members.forEach((member) => {
          ruleCounts[member.ruleId] = (ruleCounts[member.ruleId] || 0) + 1;
        });
        const orderedTimestamps = cluster.members
          .map((member) => member.timestamp)
          .sort((a, b) => new Date(a) - new Date(b));
        const sourceIds = [...new Set(cluster.members.map((member) => member.sourceId))];
        const ruleIds = Object.keys(ruleCounts);
        return {
          ...cluster,
          timestamp: orderedTimestamps[0],
          endTimestamp: orderedTimestamps.at(-1),
          sourceIds,
          ruleCounts,
          ruleIds
        };
      })
      .sort(
        (a, b) =>
          new Date(a.timestamp) - new Date(b.timestamp) ||
          a.lane.localeCompare(b.lane)
      );
  }

  function dodgeCoincidentMarks(marks, minX, maxX) {
    const laneGroups = new Map();
    marks.forEach((mark) => {
      const key = Math.round(mark.item.y * 10) / 10;
      if (!laneGroups.has(key)) laneGroups.set(key, []);
      laneGroups.get(key).push(mark);
    });
    laneGroups.forEach((laneMarks) => {
      const sorted = laneMarks.sort(
        (a, b) =>
          a.item.trueX - b.item.trueX ||
          a.order - b.order
      );
      let start = 0;
      while (start < sorted.length) {
        let end = start + 1;
        while (
          end < sorted.length &&
          sorted[end].item.trueX - sorted[end - 1].item.trueX <= 10
        ) {
          end += 1;
        }
        const cluster = sorted.slice(start, end);
        if (cluster.length > 1) {
          const spacing = cluster.length > 3 ? 10 : 13;
          const trueCenter =
            cluster.reduce((sum, mark) => sum + mark.item.trueX, 0) /
            cluster.length;
          const halfSpan = (spacing * (cluster.length - 1)) / 2;
          const center = clamp(
            trueCenter,
            minX + halfSpan + 1,
            maxX - halfSpan - 1
          );
          cluster.forEach((mark, index) => {
            mark.item.x =
              center + spacing * (index - (cluster.length - 1) / 2);
            mark.item.isDodged = true;
          });
        }
        start = end;
      }
    });
  }

  function renderPath() {
    const svg = $("#actionPath");
    const width = Math.max(560, svg.clientWidth || 900);
    const height = Math.max(210, svg.clientHeight || 310);
    const range = focusRange();
    const rawCandidates = manifest.actionCandidates.filter(candidatePassesFilters);
    const rawTransitions = manifest.transitions.filter(transitionPassesFilters);
    const lanes = laneDefinitions(rawCandidates, rawTransitions);
    const margin = {
      left: width < 720 ? 92 : 112,
      right: width < 720 ? 34 : 18,
      top: width < 720 ? 42 : 32,
      bottom: 24
    };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const laneStep = plotHeight / Math.max(1, lanes.length);
    const laneY = new Map(
      lanes.map((lane, index) => [lane.key, margin.top + laneStep * (index + 0.5)])
    );
    const xForTime = (timestamp) =>
      margin.left + pathTimePosition(timestamp, range) * plotWidth;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const highlightedRounds = new Set();
    if (state.selection?.kind === "pattern") {
      highlightedRounds.add(state.selection.roundIndex);
    }
    if (state.selection?.kind === "term") {
      const term = termByName.get(state.selection.term);
      Object.keys(term?.recordCounts || {}).forEach((id) => {
        const record = recordById.get(id);
        if (record && recordPassesFilters(record)) highlightedRounds.add(record.roundIndex);
      });
    }
    const locatedRecord = state.drilledRecord
      ? recordById.get(state.drilledRecord)
      : null;
    if (locatedRecord && recordPassesFilters(locatedRecord)) {
      highlightedRounds.add(locatedRecord.roundIndex);
    }
    highlightedRounds.forEach((roundIndex) => {
      if (!inRange(roundIndex, range)) return;
      const x1 =
        margin.left +
        boundaryPosition(roundIndex, range) * plotWidth /
          Math.max(0.0001, timePosition(manifest.liftTimestamp, range));
      const nextBoundary =
        margin.left +
        boundaryPosition(roundIndex + 1, range) * plotWidth /
          Math.max(0.0001, timePosition(manifest.liftTimestamp, range));
      svg.appendChild(
        svgEl("rect", {
          x: clamp(x1, margin.left, width - margin.right),
          y: margin.top - 6,
          width: Math.max(
            2,
            clamp(nextBoundary, margin.left, width - margin.right) -
              clamp(x1, margin.left, width - margin.right)
          ),
          height: plotHeight + 12,
          fill: state.selection?.kind === "term" ? "#e6efee" : "#f2e8ce",
          opacity: 0.7
        })
      );
    });

    lanes.forEach((lane, index) => {
      const y = laneY.get(lane.key);
      svg.appendChild(
        svgEl("rect", {
          x: margin.left,
          y: y - laneStep / 2,
          width: plotWidth,
          height: laneStep,
          fill: lane.color,
          class: "lane-band",
          opacity: index % 2 ? 0.055 : 0.075
        })
      );
      svg.appendChild(
        svgEl("line", {
          x1: margin.left,
          x2: width - margin.right,
          y1: y,
          y2: y,
          class: "svg-grid"
        })
      );
      svg.appendChild(
        svgEl("circle", {
          cx: 11,
          cy: y,
          r: 4.2,
          fill: lane.color
        })
      );
      addSvgText(svg, lane.label, {
        x: 19,
        y: y + 4,
        class: "svg-label"
      });
    });

    const taskTimeReferences = [
      {
        timestamp: "2046-06-05T17:00:00",
        label: "≈17:00 · FleX disclosure begins",
        modifier: "is-approximate"
      },
      {
        timestamp: manifest.liftTimestamp,
        label: "18:00 · Embargo deadline",
        modifier: "is-deadline"
      }
    ].filter((event) => inRange(roundIndexForTime(event.timestamp), range));
    taskTimeReferences.forEach((event) => {
      const x = xForTime(event.timestamp);
      const anchor =
        x < margin.left + 170
          ? "start"
          : x > width - margin.right - 170
          ? "end"
          : "middle";
      svg.appendChild(
        svgEl("line", {
          x1: x,
          x2: x,
          y1: margin.top - 5,
          y2: height - margin.bottom,
          class: `task-time-reference ${event.modifier}`,
          "aria-hidden": "true"
        })
      );
      addSvgText(svg, event.label, {
        x,
        y: 16,
        class: `task-time-label ${event.modifier}`,
        "text-anchor": anchor
      });
    });

    const visibleCandidateClusters = clusterCandidates(
      rawCandidates.filter(
        (candidate) => !preliftDisclosureBySource.has(candidate.sourceId)
      )
    )
      .map((cluster) => ({
        ...cluster,
        trueX: xForTime(cluster.timestamp),
        x: xForTime(cluster.timestamp),
        y: laneY.get(cluster.lane)
      }))
      .filter((cluster) => Number.isFinite(cluster.y));
    const visibleTransitions = rawTransitions
      .filter(
        (transition) =>
          transition.ruleId !== "prelift_disclosure" &&
          transition.ruleId !== "embargo_lift"
      )
      .map((transition) => ({
        ...transition,
        trueX: xForTime(transition.timestamp),
        x: xForTime(transition.timestamp),
        y: laneY.get(transitionLane(transition))
      }))
      .filter((transition) => Number.isFinite(transition.y));
    const visibleAnchors = preliftDisclosureCandidates
      .filter(candidatePassesFilters)
      .map((anchor) => ({
        ...anchor,
        trueX: xForTime(anchor.timestamp),
        x: xForTime(anchor.timestamp),
        y: laneY.get(candidateLane(anchor))
      }))
      .filter((anchor) => Number.isFinite(anchor.y));
    dodgeCoincidentMarks(
      [
        ...visibleCandidateClusters.map((item) => ({ item, order: 0 })),
        ...visibleTransitions.map((item) => ({ item, order: 1 })),
        ...visibleAnchors.map((item) => ({ item, order: 2 }))
      ],
      margin.left,
      width - margin.right
    );
    const renderedTicks = new Set();
    [
      ...visibleCandidateClusters,
      ...visibleTransitions,
      ...visibleAnchors
    ]
      .filter((item) => item.isDodged)
      .forEach((item) => {
        const key = `${item.trueX.toFixed(2)}:${item.y.toFixed(2)}`;
        if (renderedTicks.has(key)) return;
        renderedTicks.add(key);
        svg.appendChild(
          svgEl("line", {
            x1: item.trueX,
            x2: item.trueX,
            y1: item.y - 5,
            y2: item.y + 5,
            class: "collision-time-tick",
            "aria-hidden": "true"
          })
        );
      });
    candidateClusterById.clear();
    visibleCandidateClusters.forEach((cluster, index) => {
      candidateClusterById.set(cluster.id, cluster);
      const lensMatch = cluster.ruleIds.some((ruleId) =>
        pathLensRules[state.highlightLens].has(ruleId)
      );
      const lensRecordCount = new Set(
        cluster.members
          .filter((member) =>
            pathLensRules[state.highlightLens].has(member.ruleId)
          )
          .map((member) => member.sourceId)
      ).size;
      cluster.lensRecordCount = lensRecordCount;
      const selected =
        state.selection?.kind === "candidate" &&
        state.selection.id === cluster.id;
      const termLink = sourcesContainActiveTerm(cluster.sourceIds);
      const laneLabel =
        state.grouping === "people"
          ? readableAgent(cluster.lane)
          : readableChannel(cluster.lane);
      const group = svgEl("g", {
        class: `candidate-node rule-match ${
          lensMatch ? "is-lens-match" : "is-muted-by-lens"
        } ${selected ? "is-selected" : ""} ${
          termLink.linked
            ? `is-term-linked ${
                termLink.persistent
                  ? "is-term-selected-linked"
                  : "is-term-hover-linked"
              }`
            : termLink.active
            ? "is-term-dimmed"
            : ""
        }`,
        "data-candidate": cluster.id,
        tabindex: index === 0 ? "0" : "-1",
        role: "button",
        "aria-label": `${cluster.label}. ${cluster.sourceIds.length} record${
          cluster.sourceIds.length === 1 ? "" : "s"
        } from ${formatTimeSpan(
          cluster.timestamp,
          cluster.endTimestamp
        )}, ${laneLabel}. ${
          lensRecordCount
        } record${lensRecordCount === 1 ? "" : "s"} match the current ${pathLensLabels[
          state.highlightLens
        ].toLowerCase()} highlight.`
      });
      group.appendChild(
        svgEl("circle", {
          cx: cluster.x,
          cy: cluster.y,
          r: 9,
          class: "candidate-halo"
        })
      );
      group.appendChild(
        svgEl("circle", {
          cx: cluster.x,
          cy: cluster.y,
          r: 7.2,
          class: "term-link-halo"
        })
      );
      group.appendChild(
        svgEl("circle", {
          cx: cluster.x,
          cy: cluster.y,
          r: lensMatch ? 4.6 : 3.8,
          fill: lensMatch ? pathLensColors[state.highlightLens] : "#75858b",
          class: "candidate-mark"
        })
      );
      svg.appendChild(group);
    });

    const visibleIds = new Set(visibleTransitions.map((transition) => transition.id));

    let renderedRelationIndex = 0;
    manifest.relations
      .filter((relation) => relation.kind === "record-supported")
      .forEach((relation) => {
      if (!visibleIds.has(relation.source) || !visibleIds.has(relation.target)) return;
      const selectedTransitionId =
        state.selection?.kind === "transition" ? state.selection.id : null;
      const relationIsSelected =
        state.selection?.kind === "relation" &&
        state.selection.id === relation.id;
      if (
        !relationIsSelected &&
        selectedTransitionId !== relation.source &&
        selectedTransitionId !== relation.target
      ) return;
      const source = visibleTransitions.find((item) => item.id === relation.source);
      const target = visibleTransitions.find((item) => item.id === relation.target);
      const bendX = source.x + (target.x - source.x) * 0.52;
      const relationPath = `M ${source.x} ${source.y} C ${bendX} ${source.y}, ${bendX} ${target.y}, ${target.x} ${target.y}`;
      svg.appendChild(
        svgEl("path", {
          d: relationPath,
          class: "relation-hit",
          "data-relation": relation.id,
          "aria-hidden": "true"
        })
      );
      const path = svgEl("path", {
        d: relationPath,
        class: "relation-record recorded-connection",
        "data-relation": relation.id,
        tabindex: renderedRelationIndex === 0 ? "0" : "-1",
        role: "button",
        "aria-label": `${relation.label}: ${source.label} to ${target.label}`
      });
      if (relationIsSelected) {
        path.setAttribute("stroke-width", "4");
      }
      svg.appendChild(path);
      renderedRelationIndex += 1;
    });

    visibleTransitions.forEach((transition, index) => {
      const color = agentColors[transition.actor] || "#68767c";
      const lensMatch = transitionLensRules[state.highlightLens].has(
        transition.ruleId
      );
      const selected =
        state.selection?.kind === "transition" &&
        state.selection.id === transition.id;
      const termLink = sourcesContainActiveTerm([transition.sourceId]);
      const group = svgEl("g", {
        class: `transition-node rule-match ${
          lensMatch ? "is-lens-match" : "is-muted-by-lens"
        } ${selected ? "is-selected" : ""} ${
          termLink.linked
            ? `is-term-linked ${
                termLink.persistent
                  ? "is-term-selected-linked"
                  : "is-term-hover-linked"
              }`
            : termLink.active
            ? "is-term-dimmed"
            : ""
        }`,
        "data-transition": transition.id,
        tabindex: index === 0 ? "0" : "-1",
        role: "button",
        "aria-label": `${formatTime(transition.timestamp)}. ${transition.label}, ${
          transition.actorLabel
        }, ${transition.channelLabel}.`
      });
      group.appendChild(
        svgEl("circle", {
          cx: transition.x,
          cy: transition.y,
          r: 9,
          class: "node-halo"
        })
      );
      group.appendChild(
        svgEl("circle", {
          cx: transition.x,
          cy: transition.y,
          r: 7.4,
          class: "term-link-halo"
        })
      );
      const shapeAttributes = {
        class: "transition-mark",
        stroke: color
      };
      if (transition.shape === "decision") {
        group.appendChild(
          svgEl("rect", {
            x: transition.x - 5,
            y: transition.y - 5,
            width: 10,
            height: 10,
            transform: `rotate(45 ${transition.x} ${transition.y})`,
            ...shapeAttributes
          })
        );
      } else {
        group.appendChild(
          svgEl("circle", {
            cx: transition.x,
            cy: transition.y,
            r: 5.4,
            ...shapeAttributes
          })
        );
      }
      svg.appendChild(group);
    });

    visibleAnchors.forEach((anchor, index) => {
      const selected =
        state.selection?.kind === "anchor" &&
        state.selection.sourceId === anchor.sourceId;
      const termLink = sourcesContainActiveTerm([anchor.sourceId]);
      const group = svgEl("g", {
        class: `observed-anchor ${selected ? "is-selected" : ""} ${
          termLink.linked
            ? `is-term-linked ${
                termLink.persistent
                  ? "is-term-selected-linked"
                  : "is-term-hover-linked"
              }`
            : termLink.active
            ? "is-term-dimmed"
            : ""
        }`,
        "data-anchor": anchor.sourceId,
        tabindex: index === 0 ? "0" : "-1",
        role: "button",
        "aria-label": `${formatTime(anchor.timestamp)}. Public-channel record before the supplied lift, ${anchor.actorLabel}, ${anchor.channelLabel}.`
      });
      group.appendChild(
        svgEl("circle", {
          cx: anchor.x,
          cy: anchor.y,
          r: 8,
          class: "anchor-halo"
        })
      );
      group.appendChild(
        svgEl("circle", {
          cx: anchor.x,
          cy: anchor.y,
          r: 7.4,
          class: "term-link-halo"
        })
      );
      group.appendChild(
        svgEl("circle", {
          cx: anchor.x,
          cy: anchor.y,
          r: 5,
          class: "anchor-mark"
        })
      );
      svg.appendChild(group);
    });

    if (locatedRecord && recordPassesFilters(locatedRecord)) {
      const lane =
        state.grouping === "people" ? locatedRecord.actor : locatedRecord.channel;
      const y = laneY.get(lane);
      if (Number.isFinite(y)) {
        const x = xForTime(locatedRecord.timestamp);
        svg.appendChild(
          svgEl("circle", {
            cx: x,
            cy: y,
            r: 7.5,
            class: "raw-record-locator"
          })
        );
        svg.appendChild(
          svgEl("circle", {
            cx: x,
            cy: y,
            r: 2.3,
            class: "raw-record-locator-core"
          })
        );
      }
    }

    const axisY = height - 11;
    svg.appendChild(
      svgEl("line", {
        x1: margin.left,
        x2: width - margin.right,
        y1: axisY,
        y2: axisY,
        class: "svg-axis"
      })
    );
    const ticks = [
      [
        manifest.rounds[range.start].timestamp,
        range.start <= 12
          ? "May 17"
          : range.start === 13
          ? "Jun 5 · 09:00"
          : formatClock(manifest.rounds[range.start].timestamp)
      ],
      ["2046-06-05T09:00:00", "Jun 5 · 09:00"],
      ["2046-06-05T15:00:00", "15:00"],
      ["2046-06-05T17:00:00", "17:00"],
      ["2046-06-05T17:30:00", "17:30"],
      [manifest.liftTimestamp, "18:00"]
    ];
    const seen = new Set();
    const seenTimes = new Set();
    ticks.forEach(([timestamp, label]) => {
      const index = roundIndexForTime(timestamp);
      if (
        !inRange(index, range) ||
        seen.has(label) ||
        seenTimes.has(timestamp)
      ) return;
      seen.add(label);
      seenTimes.add(timestamp);
      const x = xForTime(timestamp);
      if (x < margin.left - 1 || x > width - margin.right + 1) return;
      svg.appendChild(
        svgEl("line", {
          x1: x,
          x2: x,
          y1: axisY - 3,
          y2: axisY + 3,
          class: "svg-axis"
        })
      );
      addSvgText(svg, label, {
        x,
        y: height - 3,
        class: "svg-small",
        "text-anchor":
          x < margin.left + 20
            ? "start"
            : x > width - margin.right - 20
            ? "end"
            : "middle"
      });
    });
    [13, 21].forEach((boundary) => {
      if (boundary <= range.start || boundary > range.end) return;
      const x = margin.left + pathTimePosition(manifest.rounds[boundary].timestamp, range) * plotWidth;
      svg.appendChild(
        svgEl("path", {
          d: `M ${x - 7} ${axisY} l 4 -4 l 6 8 l 4 -4`,
          class: "fold-mark"
        })
      );
    });

    if (
      !visibleCandidateClusters.length &&
      !visibleTransitions.length &&
      !visibleAnchors.length
    ) {
      addSvgText(svg, "No matching record falls inside the current filters.", {
        x: margin.left + plotWidth / 2,
        y: margin.top + plotHeight / 2,
        class: "svg-label",
        "text-anchor": "middle"
      });
    }
  }

  function aggregateAgentChannel(range) {
    const totals = {};
    agentOrder.forEach((agent) => {
      totals[agent] = {};
      channelOrder.forEach((channel) => {
        totals[agent][channel] = 0;
      });
    });
    indicesIn(range).forEach((index) => {
      const round = manifest.rounds[index];
      Object.entries(round.agentChannel).forEach(([agent, channels]) => {
        if (!totals[agent]) return;
        Object.entries(channels).forEach(([channel, count]) => {
          if (channel in totals[agent]) totals[agent][channel] += count;
        });
      });
    });
    return totals;
  }

  function rgba(hex, alpha) {
    const number = Number.parseInt(hex.slice(1), 16);
    return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${
      number & 255
    },${alpha})`;
  }

  function renderActivity() {
    const root = $("#activityTable");
    const agents = agentOrder.filter((agent) => state.people.has(agent));
    const channels = channelOrder.filter((channel) =>
      state.channels.has(channel)
    );
    const totalsA = aggregateAgentChannel(state.ranges.A);
    const totalsB = aggregateAgentChannel(state.ranges.B);
    const compact = root.clientWidth > 0 && root.clientWidth < 340;
    root.classList.toggle("is-compact", compact);
    root.style.gridTemplateColumns = `minmax(${
      compact ? "4.8rem" : "5.8rem"
    },${compact ? "4.8rem" : "6.6rem"}) repeat(${channels.length},minmax(0,1fr))`;
    root.style.gridTemplateRows = `repeat(${agents.length + 1},minmax(1.25rem,1fr))`;
    root.innerHTML = `<span></span>${channels
      .map(
        (channel) =>
          `<div class="activity-column-label" role="columnheader" title="${escapeHtml(
            readableChannel(channel)
          )}">${escapeHtml(channelShortLabels[channel])}</div>`
      )
      .join("")}`;
    agents.forEach((agent) => {
      const agentTotalA = channels.reduce(
        (sum, channel) => sum + totalsA[agent][channel],
        0
      );
      const agentTotalB = channels.reduce(
        (sum, channel) => sum + totalsB[agent][channel],
        0
      );
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="activity-row-label" role="rowheader"><i style="background:${
          agentColors[agent]
        }"></i>${escapeHtml(readableAgent(agent))}</div>`
      );
      channels.forEach((channel) => {
        const a = totalsA[agent][channel];
        const b = totalsB[agent][channel];
        const shareA = a / Math.max(1, agentTotalA);
        const shareB = b / Math.max(1, agentTotalB);
        const shift = shareB - shareA;
        const color = shift >= 0 ? "#bd5b50" : "#16827d";
        const alpha = 0.08 + Math.min(1, Math.abs(shift) * 3.2) * 0.42;
        const selected =
          state.selection?.kind === "activity" &&
          state.selection.agent === agent &&
          state.selection.channel === channel;
        root.insertAdjacentHTML(
          "beforeend",
          `<button class="activity-cell ${selected ? "is-selected" : ""}" type="button" role="gridcell" tabindex="-1" data-activity-agent="${escapeHtml(
            agent
          )}" data-activity-channel="${escapeHtml(
            channel
          )}" style="background:${rgba(color, alpha)}" aria-label="${escapeHtml(
            readableAgent(agent)
          )}, ${escapeHtml(readableChannel(channel))}: Range A ${a}, ${Math.round(
            shareA * 100
          )} percent of visible channels; Range B ${b}, ${Math.round(
            shareB * 100
          )} percent">
            <span class="activity-value-a">${a}</span>
            <b>/</b>
            <span class="activity-value-b">${b}</span>
          </button>`
        );
      });
    });
    const cells = $$(".activity-cell", root);
    if (cells.length) cells[0].tabIndex = 0;
  }

  function patternResult(round, metric) {
    const allRecords = (round.metricRecords.allMessages || [])
      .map((id) => recordById.get(id))
      .filter((record) => record && recordPassesFilters(record));
    if (metric === "allMessages") {
      return { value: allRecords.length, records: allRecords, channels: [] };
    }
    if (metric === "activeChannels") {
      const channels = [...new Set(allRecords.map((record) => record.channel))];
      return { value: channels.length, records: [], channels };
    }
    if (metric === "judgeChannels") {
      const channels = [
        ...new Set(
          allRecords
            .filter((record) => record.actor === "Judge-Agent")
            .map((record) => record.channel)
        )
      ];
      return { value: channels.length, records: [], channels };
    }
    const records = (round.metricRecords[metric] || [])
      .map((id) => recordById.get(id))
      .filter((record) => record && recordPassesFilters(record));
    return { value: records.length, records, channels: [] };
  }

  function renderPatterns() {
    const root = $("#patternsGrid");
    const range = focusRange();
    const rounds = indicesIn(range).map((index) => manifest.rounds[index]);
    const compact = root.clientWidth > 0 && root.clientWidth < 340;
    root.style.gridTemplateColumns = `minmax(${
      compact ? "4.6rem" : "5.7rem"
    },1.2fr) repeat(${rounds.length},minmax(${
      compact ? "0.4rem" : "0.55rem"
    },1fr))`;
    const labelIndices = new Set([range.start, 13, 17, 21, 22, range.end]);
    root.innerHTML = `<span></span>${rounds
      .map((round) => {
        let label = "";
        if (labelIndices.has(round.index)) {
          if (round.index === 13) label = "Jun 5 · 09";
          else if (round.index === 17) label = "13:00";
          else if (round.index === 21) label = "17";
          else if (round.index === 22) label = "18";
          else {
            label = new Date(round.timestamp).toLocaleDateString("en", {
              month: "short",
              day: "numeric"
            });
          }
        }
        return `<div class="pattern-axis-label ${
          round.index === 13 || round.index === 21 ? "phase-boundary" : ""
        }">${escapeHtml(label)}</div>`;
      })
      .join("")}`;
    patternOrder.forEach((metric) => {
      const values = new Map(
        rounds.map((round) => [round.index, patternResult(round, metric).value])
      );
      const max = Math.max(1, ...values.values());
      root.insertAdjacentHTML(
        "beforeend",
        `<div class="pattern-label" role="rowheader">${escapeHtml(
          patternShortLabels[metric]
        )}</div>`
      );
      rounds.forEach((round) => {
        const value = values.get(round.index);
        const alpha = value ? 0.18 + (value / max) * 0.72 : 0.055;
        const selected =
          state.selection?.kind === "pattern" &&
          state.selection.metric === metric &&
          state.selection.roundIndex === round.index;
        root.insertAdjacentHTML(
          "beforeend",
          `<button type="button" role="gridcell" tabindex="-1" class="pattern-cell ${
            selected ? "is-selected" : ""
          } ${round.index === 13 || round.index === 21 ? "phase-boundary" : ""}" data-pattern="${metric}" data-round-index="${
            round.index
          }" style="--cell-color:${rgba(
            patternColors[metric],
            alpha
          )}" aria-label="${escapeHtml(patternShortLabels[metric])}, ${
            round.label
          }: ${value}"></button>`
        );
      });
    });
    const cells = $$(".pattern-cell", root);
    if (cells.length) cells[0].tabIndex = 0;
  }

  function recordButtonsHtml(records) {
    return records
      .map(
        (record) =>
          `<button type="button" data-record-id="${escapeHtml(
            record.id
          )}"><time>${escapeHtml(
            formatTime(record.timestamp)
          )}</time><span class="record-summary"><span class="code-token">${escapeHtml(
            record.id
          )}</span><span class="record-context">${agentPillHtml(
            record.actor
          )}<span>${escapeHtml(readableChannel(record.channel))}</span></span></span></button>`
      )
      .join("");
  }

  function recordListHtml(records, limit = state.evidenceRecordLimit) {
    if (!records.length) return `<p>No matching record metadata.</p>`;
    const visible = records.slice(0, limit);
    const remainingCount = Math.max(0, records.length - visible.length);
    return `<div class="record-list">${recordButtonsHtml(visible)}</div>
      ${
        records.length > limit
          ? `<p class="record-list-status">Showing ${visible.length} of ${records.length}</p>
            <button class="record-list-more" type="button" data-load-more-records>
              Load ${Math.min(10, remainingCount)} more
            </button>`
          : ""
      }`;
  }

  function uniqueRecords(records) {
    return [
      ...new Map(records.filter(Boolean).map((record) => [record.id, record])).values()
    ];
  }

  function evidenceRecordsForMode(records) {
    if (state.evidenceRecordMode === "matched") {
      return records.filter((record) => candidateMessageIds.has(record.id));
    }
    if (state.evidenceRecordMode === "other") {
      return records.filter((record) => !candidateMessageIds.has(record.id));
    }
    return records;
  }

  function evidenceRecordModesHtml(records) {
    const unique = uniqueRecords(records);
    const matched = unique.filter((record) =>
      candidateMessageIds.has(record.id)
    ).length;
    const counts = {
      all: unique.length,
      matched,
      other: unique.length - matched
    };
    const labels = {
      all: "All",
      matched: "Rule matches",
      other: "Other records"
    };
    return `<div class="evidence-record-modes" role="group" aria-label="Records shown">
      ${["all", "matched", "other"]
        .map(
          (mode) =>
            `<button type="button" data-evidence-mode="${mode}" class="${
              state.evidenceRecordMode === mode ? "is-active" : ""
            }" aria-pressed="${
              state.evidenceRecordMode === mode
            }">${labels[mode]} · ${counts[mode]}</button>`
        )
        .join("")}
    </div>`;
  }

  function renderRecordDrill(recordId) {
    const record = recordById.get(recordId);
    const transition = manifest.transitions.find(
      (item) => item.sourceId === recordId
    );
    if (!record && !transition) return "";
    const source = transition?.evidence || record;
    return `<nav class="evidence-drill-nav" aria-label="Evidence navigation">
      <button class="evidence-back" type="button" data-back-evidence>← Back to selection</button>
    </nav>
    <section class="evidence-block">
      <h3>Record metadata</h3>
      <dl class="evidence-meta">
        <dt>ID</dt><dd class="code-token">${escapeHtml(source.id)}</dd>
        <dt>Time</dt><dd>${escapeHtml(formatTime(source.timestamp))}</dd>
        <dt>Actor</dt><dd>${agentPillHtml(source.actor)}</dd>
        <dt>Channel</dt><dd>${escapeHtml(readableChannel(source.channel))}</dd>
        <dt>Recipients</dt><dd>${recipientsHtml(source.recipients)}</dd>
      </dl>
      ${
        source.content
          ? evidenceExcerptHtml(source.content, source.id)
          : `<p>No message excerpt is available for this context record.</p>`
      }
    </section>`;
  }

  function renderEvidence() {
    const root = $("#evidenceBody");
    if (!state.selection && !state.drilledRecord) {
      root.innerHTML = `<div class="empty-evidence">
        <strong>Select a mark to inspect its source.</strong>
      </div>`;
      return;
    }
    if (state.drilledRecord) {
      root.innerHTML = renderRecordDrill(state.drilledRecord);
      return;
    }
    let html = "";
    const selection = state.selection;
    if (!selection) {
      root.innerHTML = html;
      return;
    }
    if (selection.kind === "anchor") {
      const anchor = preliftDisclosureBySource.get(selection.sourceId);
      if (!anchor) {
        root.innerHTML = html;
        return;
      }
      const sourceTransition = manifest.transitions.find(
        (item) => item.sourceId === anchor.sourceId
      );
      const record = recordById.get(anchor.sourceId);
      html += `<section class="evidence-block">
        <h3>Public-channel record before 18:00</h3>
        <dl class="evidence-meta">
          <dt>Time</dt><dd>${escapeHtml(formatTime(anchor.timestamp))}</dd>
          <dt>Actor</dt><dd>${agentPillHtml(anchor.actor, anchor.actorLabel)}</dd>
          <dt>Channel</dt><dd>${escapeHtml(anchor.channelLabel)}</dd>
          <dt>Source</dt><dd class="code-token">${escapeHtml(anchor.sourceId)}</dd>
        </dl>
      </section>
      ${
        sourceTransition?.evidence?.content
          ? `<section class="evidence-block">
              <h3>Source excerpt</h3>
              ${evidenceExcerptHtml(
                sourceTransition.evidence.content,
                sourceTransition.sourceId
              )}
            </section>`
          : record
          ? recordListHtml([record], 1)
          : ""
      }`;
    } else if (selection.kind === "candidate") {
      const cluster = candidateClusterById.get(selection.id);
      if (!cluster) {
        root.innerHTML = html;
        return;
      }
      const records = cluster.sourceIds
        .map((sourceId) => recordById.get(sourceId))
        .filter(Boolean)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const lensRuleIds = pathLensRules[state.highlightLens];
      const lensRecordCount = new Set(
        cluster.members
          .filter((member) => lensRuleIds.has(member.ruleId))
          .map((member) => member.sourceId)
      ).size;
      const relatedValues = [
        ...new Set(
          cluster.members.map((member) =>
            state.grouping === "people" ? member.channel : member.actor
          )
        )
      ];
      html += `<section class="evidence-block">
        <h3>${escapeHtml(cluster.label)}</h3>
        <dl class="evidence-meta">
          <dt>Records span</dt><dd>${escapeHtml(
            formatTimeSpan(cluster.timestamp, cluster.endTimestamp)
          )}</dd>
          <dt>${state.grouping === "people" ? "Person" : "Channel"}</dt><dd>${
            state.grouping === "people"
              ? agentPillHtml(cluster.lane)
              : escapeHtml(readableChannel(cluster.lane))
          }</dd>
          <dt>Records</dt><dd>${cluster.sourceIds.length}</dd>
          <dt>Highlight</dt><dd>${escapeHtml(pathLensLabels[state.highlightLens])} · ${lensRecordCount} / ${cluster.sourceIds.length}</dd>
          <dt>${state.grouping === "people" ? "Channels" : "People"}</dt><dd>${
            state.grouping === "people"
              ? escapeHtml(
                  relatedValues.map((channel) => readableChannel(channel)).join(", ")
                )
              : agentPillsHtml(relatedValues)
          }</dd>
        </dl>
      </section>
      <section class="evidence-block">
        <h3>Matched categories</h3>
        <div class="evidence-tags">${cluster.ruleIds
          .map(
            (ruleId) =>
              `<span class="evidence-tag">${escapeHtml(
                candidateRuleLabels.get(ruleId) || ruleId.replaceAll("_", " ")
              )}&nbsp;·&nbsp;${cluster.ruleCounts[ruleId]}</span>`
          )
          .join("")}</div>
      </section>
      <section class="evidence-block">
        <h3>Source records</h3>
        <p class="evidence-guidance">Select a record to inspect the exact message.</p>
        ${recordListHtml(records, 12)}
      </section>`;
    } else if (selection.kind === "transition") {
      const item = transitionById.get(selection.id);
      const source = item.evidence;
      html += `<section class="evidence-block">
        <h3>${escapeHtml(item.label)}</h3>
        <dl class="evidence-meta">
          <dt>Analytical time</dt><dd>${escapeHtml(formatTime(item.timestamp))}</dd>
          <dt>Precision</dt><dd>${escapeHtml(item.precision)}</dd>
          <dt>Actor</dt><dd>${agentPillHtml(item.actor, item.actorLabel)}</dd>
          <dt>Channel</dt><dd>${escapeHtml(item.channelLabel)}</dd>
          <dt>Source</dt><dd class="code-token">${escapeHtml(item.sourceId)}</dd>
        </dl>
      </section>
      <section class="evidence-block">
        <h3>Source excerpt</h3>
        ${evidenceExcerptHtml(source.content, item.sourceId)}
      </section>`;
    } else if (selection.kind === "relation") {
      const relation = relationById.get(selection.id);
      const source = transitionById.get(relation.source);
      const target = transitionById.get(relation.target);
      html += `<section class="evidence-block">
        <h3>Recorded connection</h3>
        <dl class="evidence-meta">
          <dt>Basis</dt><dd>${escapeHtml(relation.label)}</dd>
          <dt>From</dt><dd class="evidence-event">${escapeHtml(
            formatTime(source.timestamp)
          )}${agentPillHtml(source.actor, source.actorLabel)}<span>${escapeHtml(
            source.channelLabel
          )}</span></dd>
          <dt>To</dt><dd class="evidence-event">${escapeHtml(
            formatTime(target.timestamp)
          )}${agentPillHtml(target.actor, target.actorLabel)}<span>${escapeHtml(
            target.channelLabel
          )}</span></dd>
          <dt>Elapsed</dt><dd>${Math.round(
            (new Date(target.timestamp) - new Date(source.timestamp)) / 60000
          )} minutes</dd>
        </dl>
      </section>
      ${
        target?.evidence?.content
          ? `<section class="evidence-block">
              <h3>Later source excerpt</h3>
              ${evidenceExcerptHtml(target.evidence.content, target.sourceId)}
            </section>`
          : ""
      }`;
    } else if (selection.kind === "term") {
      const result = filteredTermCount(selection.term);
      html += `<section class="evidence-block">
        <h3>${escapeHtml(selection.term)}</h3>
        <dl class="evidence-meta">
          <dt>Occurrences</dt><dd>${result.count}</dd>
          <dt>Matching records</dt><dd>${result.records.length}</dd>
          <dt>Scope</dt><dd>${escapeHtml(focusLabel())}</dd>
        </dl>
        <p class="evidence-guidance">Select a record to inspect the exact message.</p>
        ${recordListHtml(result.records)}
      </section>`;
    } else if (selection.kind === "activity") {
      const records = manifest.records.filter(
        (record) =>
          record.actor === selection.agent &&
          record.channel === selection.channel
      );
      const recordsA = records.filter((record) =>
        inRange(record.roundIndex, state.ranges.A)
      );
      const recordsB = records.filter((record) =>
        inRange(record.roundIndex, state.ranges.B)
      );
      const visibleChannels = channelOrder.filter((channel) =>
        state.channels.has(channel)
      );
      const totalsA = aggregateAgentChannel(state.ranges.A);
      const totalsB = aggregateAgentChannel(state.ranges.B);
      const agentTotalA = visibleChannels.reduce(
        (sum, channel) => sum + totalsA[selection.agent][channel],
        0
      );
      const agentTotalB = visibleChannels.reduce(
        (sum, channel) => sum + totalsB[selection.agent][channel],
        0
      );
      const shareA = recordsA.length / Math.max(1, agentTotalA);
      const shareB = recordsB.length / Math.max(1, agentTotalB);
      const recordsShownA = evidenceRecordsForMode(recordsA);
      const recordsShownB = evidenceRecordsForMode(recordsB);
      html += `<section class="evidence-block">
        <h3 class="evidence-selection-title">${agentPillHtml(
          selection.agent
        )}<span>${escapeHtml(readableChannel(selection.channel))}</span></h3>
        <dl class="evidence-meta">
          <dt>Range A total</dt><dd>${recordsA.length}</dd>
          <dt>Range B total</dt><dd>${recordsB.length}</dd>
          <dt>A channel share</dt><dd>${(shareA * 100).toFixed(1)}%</dd>
          <dt>B channel share</dt><dd>${(shareB * 100).toFixed(1)}%</dd>
        </dl>
        ${evidenceRecordModesHtml([...recordsA, ...recordsB])}
        <p><span class="evidence-tag">Range A</span>${escapeHtml(
          rangeLabel(state.ranges.A)
        )}</p>
        ${recordListHtml(recordsShownA)}
        <p><span class="evidence-tag">Range B</span>${escapeHtml(
          rangeLabel(state.ranges.B)
        )}</p>
        ${recordListHtml(recordsShownB)}
      </section>`;
    } else if (selection.kind === "pattern") {
      const round = manifest.rounds[selection.roundIndex];
      const result = patternResult(round, selection.metric);
      const isChannelSet = ["activeChannels", "judgeChannels"].includes(
        selection.metric
      );
      const recordsShown =
        selection.metric === "allMessages"
          ? evidenceRecordsForMode(result.records)
          : result.records;
      html += `<section class="evidence-block">
        <h3>${escapeHtml(patternShortLabels[selection.metric])}</h3>
        <dl class="evidence-meta">
          <dt>Round</dt><dd>${escapeHtml(round.label)}</dd>
          <dt>Value</dt><dd>${result.value}</dd>
          <dt>Headline</dt><dd>${escapeHtml(round.headline)}</dd>
        </dl>
        ${
          selection.metric === "allMessages"
            ? evidenceRecordModesHtml(result.records)
            : ""
        }
        ${
          isChannelSet
            ? `<p>${result.channels
                .map(
                  (channel) =>
                    `<span class="evidence-tag">${escapeHtml(
                      readableChannel(channel)
                    )}</span>`
                )
                .join("") || "No matching channel."}</p>`
            : recordListHtml(recordsShown)
        }
      </section>`;
    }
    root.innerHTML = html;
  }

  function renderSelectionOnly() {
    renderControls();
    renderTerms();
    renderPath();
    renderActivity();
    renderPatterns();
    renderEvidence();
  }

  function renderAll() {
    renderControls();
    renderFilterChips();
    renderTimeline();
    renderTerms();
    renderPath();
    renderActivity();
    renderPatterns();
    renderEvidence();
  }

  function updateRangeFromPointer(event) {
    if (!state.drag) return;
    const svg = $("#sharedTimeline");
    const rect = svg.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const positions = boundaryPositions(allRoundRange);
    let boundary = 0;
    let distance = Infinity;
    positions.forEach((position, index) => {
      const candidateDistance = Math.abs(position - x);
      if (candidateDistance < distance) {
        boundary = index;
        distance = candidateDistance;
      }
    });
    const { key, mode, original, anchorBoundary } = state.drag;
    let start = original.start;
    let end = original.end;
    if (mode === "start") {
      start = clamp(boundary, 0, end);
    } else if (mode === "end") {
      end = clamp(boundary - 1, start, manifest.rounds.length - 1);
    } else {
      const length = original.end - original.start;
      const delta = boundary - anchorBoundary;
      start = clamp(original.start + delta, 0, manifest.rounds.length - 1 - length);
      end = start + length;
    }
    state.editRange = key;
    state.ranges[key] = { start, end };
    $("#dragReadout").hidden = false;
    $("#dragReadout").style.left = `${event.clientX + 12}px`;
    $("#dragReadout").style.top = `${event.clientY + 12}px`;
    $("#dragReadout").textContent = `Range ${key} · ${rangeLabel(state.ranges[key])} · ${
      end - start + 1
    } rounds`;
    renderControls();
    renderTimeline();
    renderTerms();
    renderPath();
    renderActivity();
    renderPatterns();
  }

  function endRangeDrag() {
    if (!state.drag) return;
    const key = state.drag.key;
    const changed =
      state.drag.original.start !== state.ranges[key].start ||
      state.drag.original.end !== state.ranges[key].end;
    const snapshot = state.drag.snapshot;
    state.drag = null;
    $("#dragReadout").hidden = true;
    suppressTimelineClickUntil = performance.now() + 250;
    if (changed) {
      pushRangeHistory(snapshot);
      renderAll();
      return;
    }
    activateTimelineRange(key);
  }

  function roveGrid(event, selector, columns) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    const cells = $$(selector);
    const index = cells.indexOf(event.target.closest(selector));
    if (index < 0) return;
    const delta =
      event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
        ? -columns
        : columns;
    const next = clamp(index + delta, 0, cells.length - 1);
    cells.forEach((cell) => (cell.tabIndex = -1));
    cells[next].tabIndex = 0;
    cells[next].focus();
    event.preventDefault();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const focusButton = event.target.closest("[data-focus]");
      if (focusButton) {
        if (state.focus === focusButton.dataset.focus) return;
        pushRangeHistory();
        state.focus = focusButton.dataset.focus;
        state.selection = null;
        state.drilledRecord = null;
        state.evidenceRecordMode = "all";
        resetTermPaging();
        renderAll();
        return;
      }
      const editButton = event.target.closest("[data-edit]");
      if (editButton) {
        if (state.editRange === editButton.dataset.edit) return;
        pushRangeHistory();
        state.editRange = editButton.dataset.edit;
        renderAll();
        return;
      }
      const showRangeButton = event.target.closest("[data-show-range]");
      if (showRangeButton) {
        activateTimelineRange(showRangeButton.dataset.showRange, {
          toggle: false
        });
        return;
      }
      const personButton = event.target.closest("[data-person]");
      if (personButton) {
        const person = personButton.dataset.person;
        if (state.people.has(person)) {
          if (state.people.size > 1) state.people.delete(person);
        } else {
          state.people.add(person);
        }
        state.selection = null;
        state.drilledRecord = null;
        state.evidenceRecordMode = "all";
        resetTermPaging();
        renderAll();
        return;
      }
      const channelButton = event.target.closest("[data-channel]");
      if (channelButton) {
        const channel = channelButton.dataset.channel;
        if (state.channels.has(channel)) {
          if (state.channels.size > 1) state.channels.delete(channel);
        } else {
          state.channels.add(channel);
        }
        state.selection = null;
        state.drilledRecord = null;
        state.evidenceRecordMode = "all";
        resetTermPaging();
        renderAll();
        return;
      }
      const selectAll = event.target.closest("[data-select-all]");
      if (selectAll) {
        const key = selectAll.dataset.selectAll;
        state[key] = new Set(key === "people" ? agentOrder : channelOrder);
        state.selection = null;
        state.drilledRecord = null;
        state.evidenceRecordMode = "all";
        resetTermPaging();
        renderAll();
        return;
      }
      const groupButton = event.target.closest("[data-group]");
      if (groupButton) {
        state.grouping = groupButton.dataset.group;
        state.selection = null;
        renderAll();
        return;
      }
      const lensButton = event.target.closest("[data-lens]");
      if (lensButton) {
        state.highlightLens = lensButton.dataset.lens;
        renderControls();
        renderPath();
        renderEvidence();
        return;
      }
      const supportButton = event.target.closest("[data-support]");
      if (supportButton) {
        state.supportView = supportButton.dataset.support;
        renderControls();
        state.supportView === "activity" ? renderActivity() : renderPatterns();
        return;
      }
      const termButton = event.target.closest("[data-term]");
      if (termButton) {
        state.hoveredTerm = null;
        setSelection({ kind: "term", term: termButton.dataset.term });
        return;
      }
      const loadMoreTerms = event.target.closest("#loadMoreTerms");
      if (loadMoreTerms) {
        loadNextTermRow();
        return;
      }
      const transitionNode = event.target.closest("[data-transition]");
      if (transitionNode) {
        setSelection({ kind: "transition", id: transitionNode.dataset.transition });
        return;
      }
      const anchorNode = event.target.closest("[data-anchor]");
      if (anchorNode) {
        setSelection({ kind: "anchor", sourceId: anchorNode.dataset.anchor });
        return;
      }
      const candidateNode = event.target.closest("[data-candidate]");
      if (candidateNode) {
        setSelection({ kind: "candidate", id: candidateNode.dataset.candidate });
        return;
      }
      const relationNode = event.target.closest("[data-relation]");
      if (relationNode) {
        setSelection({ kind: "relation", id: relationNode.dataset.relation });
        return;
      }
      const activityCell = event.target.closest("[data-activity-agent]");
      if (activityCell) {
        setSelection({
          kind: "activity",
          agent: activityCell.dataset.activityAgent,
          channel: activityCell.dataset.activityChannel
        });
        return;
      }
      const patternCell = event.target.closest("[data-pattern]");
      if (patternCell) {
        setSelection({
          kind: "pattern",
          metric: patternCell.dataset.pattern,
          roundIndex: Number(patternCell.dataset.roundIndex)
        });
        return;
      }
      const recordButton = event.target.closest("[data-record-id]");
      if (recordButton) {
        state.drilledRecord = recordButton.dataset.recordId;
        renderPath();
        renderEvidence();
        $("#evidenceRail").scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const backEvidence = event.target.closest("[data-back-evidence]");
      if (backEvidence) {
        state.drilledRecord = null;
        renderPath();
        renderEvidence();
        $("#evidenceRail").scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const loadMoreRecords = event.target.closest("[data-load-more-records]");
      if (loadMoreRecords) {
        state.evidenceRecordLimit += 10;
        renderEvidence();
        return;
      }
      const evidenceMode = event.target.closest("[data-evidence-mode]");
      if (evidenceMode) {
        state.evidenceRecordMode = evidenceMode.dataset.evidenceMode;
        state.evidenceRecordLimit = 10;
        renderEvidence();
        return;
      }
      if (
        event.target === $("#actionPath") ||
        event.target === $(".path-chart-shell")
      ) {
        clearSelection();
      }
    });

    $("#resetWorkspace").addEventListener("click", () => {
      state.focus = "all";
      state.editRange = "A";
      state.ranges = {
        A: { ...manifest.ranges.A },
        B: { ...manifest.ranges.B }
      };
      state.rangeHistory = [];
      state.people = new Set(agentOrder);
      state.channels = new Set(channelOrder);
      state.grouping = "people";
      state.highlightLens = "release";
      state.supportView = "activity";
      state.selection = null;
      state.drilledRecord = null;
      state.evidenceRecordLimit = 10;
      state.evidenceRecordMode = "all";
      state.termVisibleCount = null;
      state.termCompact = null;
      termScopeCache = null;
      state.hoveredTerm = null;
      state.hoveredPathKey = null;
      state.hoveredPathRecordIds.clear();
      renderAll();
    });
    $("#undoRange").addEventListener("click", () => {
      const previous = state.rangeHistory.pop();
      if (!previous) return;
      state.ranges.A = { ...previous.A };
      state.ranges.B = { ...previous.B };
      state.editRange = previous.editRange;
      state.focus = previous.focus ?? state.focus;
      state.selection = null;
      state.drilledRecord = null;
      state.evidenceRecordMode = "all";
      resetTermPaging();
      renderAll();
    });
    $("#clearEvidence").addEventListener("click", clearSelection);
    $("#clearPattern").addEventListener("click", clearSelection);
    $("#sharedTimeline").addEventListener("pointerdown", (event) => {
      const handle = event.target.closest("[data-range-handle]");
      const band = event.target.closest("[data-range-band]");
      if (!handle && !band) return;
      const key = handle?.dataset.rangeKey || band.dataset.rangeBand;
      resetTermPaging();
      const svgRect = $("#sharedTimeline").getBoundingClientRect();
      const ratio = clamp((event.clientX - svgRect.left) / svgRect.width, 0, 1);
      const positions = boundaryPositions(allRoundRange);
      let anchorBoundary = 0;
      positions.forEach((position, index) => {
        if (Math.abs(position - ratio) < Math.abs(positions[anchorBoundary] - ratio)) {
          anchorBoundary = index;
        }
      });
      state.drag = {
        key,
        mode: handle?.dataset.rangeHandle || "band",
        original: { ...state.ranges[key] },
        anchorBoundary,
        snapshot: {
          A: { ...state.ranges.A },
          B: { ...state.ranges.B },
          editRange: state.editRange,
          focus: state.focus
        }
      };
      event.preventDefault();
    });
    $("#sharedTimeline").addEventListener("click", (event) => {
      const band = event.target.closest("[data-range-band]");
      if (!band || performance.now() < suppressTimelineClickUntil) return;
      activateTimelineRange(band.dataset.rangeBand);
    });
    window.addEventListener("pointermove", updateRangeFromPointer);
    window.addEventListener("pointerup", endRangeDrag);
    $("#sharedTimeline").addEventListener("keydown", (event) => {
      const band = event.target.closest("[data-range-band]");
      if (!band) return;
      const key = band.dataset.rangeBand;
      if (["Enter", " "].includes(event.key)) {
        activateTimelineRange(key);
        event.preventDefault();
        return;
      }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const range = state.ranges[key];
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const length = range.end - range.start;
      const start = clamp(
        range.start + direction,
        0,
        manifest.rounds.length - 1 - length
      );
      const historySnapshot = timeStateSnapshot();
      state.editRange = key;
      setRange(key, start, start + length, true, historySnapshot);
      event.preventDefault();
    });

    const setHoveredTerm = (term) => {
      const next = term || null;
      if (state.hoveredTerm === next) return;
      state.hoveredTerm = next;
      renderPath();
      renderEvidence();
    };
    $("#termCloud").addEventListener("pointerover", (event) => {
      const button = event.target.closest("[data-term]");
      if (button) setHoveredTerm(button.dataset.term);
    });
    $("#termCloud").addEventListener("pointerout", (event) => {
      const button = event.target.closest("[data-term]");
      if (button && !button.contains(event.relatedTarget)) setHoveredTerm(null);
    });
    $("#termCloud").addEventListener("focusin", (event) => {
      const button = event.target.closest("[data-term]");
      if (button) setHoveredTerm(button.dataset.term);
    });
    $("#termCloud").addEventListener("focusout", (event) => {
      const button = event.target.closest("[data-term]");
      if (button && !button.contains(event.relatedTarget)) setHoveredTerm(null);
    });

    const pathNodeRecordIds = (node) => {
      if (!node) return [];
      if (node.dataset.transition) {
        const transition = transitionById.get(node.dataset.transition);
        return transition?.sourceId ? [transition.sourceId] : [];
      }
      if (node.dataset.anchor) return [node.dataset.anchor];
      if (node.dataset.candidate) {
        return candidateClusterById.get(node.dataset.candidate)?.sourceIds || [];
      }
      return [];
    };
    const setHoveredPathNode = (node) => {
      const nextKey = node
        ? node.dataset.transition ||
          node.dataset.anchor ||
          node.dataset.candidate ||
          null
        : null;
      if (state.hoveredPathKey === nextKey) return;
      state.hoveredPathKey = nextKey;
      state.hoveredPathRecordIds = new Set(pathNodeRecordIds(node));
      renderTerms();
    };

    $("#actionPath").addEventListener("pointermove", (event) => {
      const node = event.target.closest(
        "[data-transition], [data-candidate], [data-anchor]"
      );
      const tooltip = $("#pathTooltip");
      if (!node) {
        tooltip.hidden = true;
        setHoveredPathNode(null);
        return;
      }
      setHoveredPathNode(node);
      const item = node.dataset.transition
        ? transitionById.get(node.dataset.transition)
        : node.dataset.anchor
        ? preliftDisclosureBySource.get(node.dataset.anchor)
        : candidateClusterById.get(node.dataset.candidate);
      tooltip.hidden = false;
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY + 12}px`;
      tooltip.innerHTML = node.dataset.transition
        ? `<strong>${escapeHtml(formatTime(item.timestamp))}</strong><br>${escapeHtml(
            item.actorLabel
          )} · ${escapeHtml(item.channelLabel)}<br>${escapeHtml(item.label)}`
        : node.dataset.anchor
        ? `<strong>${escapeHtml(formatTime(item.timestamp))}</strong><br>${escapeHtml(
            item.actorLabel
          )} · ${escapeHtml(item.channelLabel)}<br>Public-channel record before 18:00`
        : `<strong>${escapeHtml(
            formatTimeSpan(item.timestamp, item.endTimestamp)
          )}</strong><br>${item.sourceIds.length} record${
            item.sourceIds.length === 1 ? "" : "s"
          } · ${item.lensRecordCount} match the current ${escapeHtml(
            pathLensLabels[state.highlightLens].toLowerCase()
          )} highlight`;
    });
    $("#actionPath").addEventListener("pointerleave", () => {
      $("#pathTooltip").hidden = true;
      setHoveredPathNode(null);
    });
    $("#actionPath").addEventListener("focusin", (event) => {
      const node = event.target.closest(
        "[data-transition], [data-candidate], [data-anchor]"
      );
      if (node) setHoveredPathNode(node);
    });
    $("#actionPath").addEventListener("focusout", (event) => {
      const node = event.target.closest(
        "[data-transition], [data-candidate], [data-anchor]"
      );
      if (node && !node.contains(event.relatedTarget)) setHoveredPathNode(null);
    });

    $("#actionPath").addEventListener("keydown", (event) => {
      const actionable = event.target.closest(
        "[data-transition], [data-candidate], [data-anchor], [data-relation]"
      );
      if (actionable && ["Enter", " "].includes(event.key)) {
        const focusSelector = actionable.dataset.transition
          ? `[data-transition="${actionable.dataset.transition}"]`
          : actionable.dataset.candidate
          ? `[data-candidate="${actionable.dataset.candidate}"]`
          : actionable.dataset.anchor
          ? `[data-anchor="${actionable.dataset.anchor}"]`
          : `[data-relation="${actionable.dataset.relation}"][role="button"]`;
        actionable.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
        requestAnimationFrame(() => $(focusSelector)?.focus());
        event.preventDefault();
        return;
      }
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const selector = event.target.closest("[data-candidate]")
        ? "[data-candidate]"
        : event.target.closest("[data-transition]")
        ? "[data-transition]"
        : event.target.closest("[data-anchor]")
        ? "[data-anchor]"
        : event.target.closest("[data-relation]")
        ? "[data-relation]"
        : null;
      if (!selector) return;
      const nodes = $$(selector, $("#actionPath"));
      const current = event.target.closest(selector);
      const index = nodes.indexOf(current);
      const next = clamp(
        index + (event.key === "ArrowRight" ? 1 : -1),
        0,
        nodes.length - 1
      );
      nodes.forEach((node) => node.setAttribute("tabindex", "-1"));
      nodes[next].setAttribute("tabindex", "0");
      nodes[next].focus();
      event.preventDefault();
    });
    $("#activityTable").addEventListener("keydown", (event) => {
      const columns = state.channels.size;
      roveGrid(event, ".activity-cell", Math.max(1, columns));
    });
    $("#patternsGrid").addEventListener("keydown", (event) => {
      roveGrid(event, ".pattern-cell", focusRange().end - focusRange().start + 1);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const focusSelector = selectionFocusSelector();
      clearSelection();
      if (focusSelector) requestAnimationFrame(() => $(focusSelector)?.focus());
    });

    let resizeFrame = 0;
    window.addEventListener("resize", () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        renderControls();
        renderTimeline();
        renderTerms();
        renderPath();
        renderActivity();
        renderPatterns();
      });
    });
  }

  function init() {
    renderAll();
    bindEvents();
  }

  init();
})();
