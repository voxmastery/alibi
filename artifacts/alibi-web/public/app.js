(() => {
  "use strict";
  const BAND = { clear: "#2DD4A7", watch: "#F5A524", flagged: "#FF4D4D", unknown: "#555A66" };
  const EDGE = { bank_account: "#FF4D4D", address: "#FF8A65", filing_ip: "#FFB74D", phone: "#7E9BFF", email: "#9C7EFF", pan: "#3A4050" };
  const months = Array.from({ length: 19 }, (_, i) => new Date(Date.UTC(2025, 2 + i, 1)).toISOString().slice(0, 7));
  const $ = (id) => document.getElementById(id);
  const timeline = $("timeline"), playButton = $("play"), vendorSelect = $("vendor-select"), drawer = $("drawer");
  let graph = null, graphData = null, requestedIndex = 18, committedIndex = 18, lastFailedIndex = 18, playing = false, playbackTimer = null, firstCount = true, didFit = false, rendererUnavailable = false;
  let graphRequestId = 0, drawerRequestId = 0, selectedVendorId = null, selectedVendorDetail = null, detailLoading = false, detailError = null, lastFocused = null;
  const escapeHtml = (value) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  const number = (value) => Number(value || 0).toLocaleString("en-IN");
  const committedMonth = () => months[committedIndex];
  const requestedMonth = () => months[requestedIndex];
  const visibleNodes = () => (graphData?.nodes || []).filter((node) => node.visible_at_selected_month);
  const setStatus = (title, copy) => { $("status-title").textContent = title; $("status-copy").textContent = copy; };
  function alertUser(title, copy, retry = false) { $("alert-title").textContent = title; $("alert-copy").textContent = ` ${copy}`; $("retry").hidden = !retry; $("inline-alert").classList.add("visible"); }
  function clearAlert() { $("inline-alert").classList.remove("visible"); }
  function setRendererWarning(visible) { rendererUnavailable = visible; $("renderer-warning").classList.toggle("visible", visible); }
  function syncTimeline() { $("selected-month").textContent = committedMonth(); timeline.value = String(committedIndex); timeline.setAttribute("aria-valuetext", new Date(`${committedMonth()}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })); }
  function counter(id, target, currency, animate) {
    const element = $(id), start = performance.now(), from = animate ? 0 : Number(element.dataset.value || 0);
    cancelAnimationFrame(element.countFrame);
    const draw = (now) => { const p = animate ? Math.min((now - start) / 800, 1) : 1, value = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))); element.textContent = currency ? `₹${number(value)}` : number(value); element.dataset.value = String(value); if (p < 1) element.countFrame = requestAnimationFrame(draw); };
    element.countFrame = requestAnimationFrame(draw);
  }
  function updateCounters(animate = false) {
    const nodes = visibleNodes();
    counter("vendors-count", nodes.length, false, animate);
    counter("snapshots-count", nodes.reduce((sum, node) => sum + Number(node.snapshot_count || 0), 0), false, animate);
    counter("itc-count", nodes.filter((node) => node.band === "flagged").reduce((sum, node) => sum + Number(node.itc_exposed || 0), 0), true, animate);
  }
  function updateSelector() {
    const prior = vendorSelect.value; vendorSelect.replaceChildren(new Option("Select a vendor on record", ""));
    visibleNodes().sort((a, b) => String(a.legal_name || a.name).localeCompare(String(b.legal_name || b.name))).forEach((node) => vendorSelect.add(new Option(node.legal_name || node.name || node.id, node.id)));
    vendorSelect.value = [...vendorSelect.options].some((option) => option.value === prior) ? prior : "";
  }
  function applyCommittedMonth(animate = false) {
    syncTimeline();
    if (!graphData) return;
    if (graph) graph.nodeVal((node) => Math.max(1, Number(node.total_value || 0) / 250000)).nodeColor((node) => BAND[node.band] || BAND.unknown).nodeVisibility((node) => node.visible_at_selected_month).linkVisibility((link) => Boolean(link.source?.visible_at_selected_month && link.target?.visible_at_selected_month));
    updateCounters(animate); updateSelector();
    setStatus("network / uploaded records", `${number(visibleNodes().length)} vendor records as of ${committedMonth()}.`);
    if (drawer.classList.contains("open")) renderSelectedDrawer(false);
  }
  function stopPlayback() { playing = false; clearTimeout(playbackTimer); playbackTimer = null; playButton.textContent = "PLAY"; playButton.setAttribute("aria-label", "Play monthly timeline"); }
  async function playNext(targetIndex = committedIndex + 1) {
    if (!playing) return;
    if (targetIndex >= months.length) { stopPlayback(); return; }
    const ok = await loadGraph(targetIndex);
    if (!playing || !ok) return;
    playbackTimer = setTimeout(() => playNext(), 1000);
  }
  function togglePlayback() {
    if (playing) return stopPlayback();
    const firstIndex = committedIndex >= months.length - 1 ? 0 : committedIndex + 1;
    playing = true; playButton.textContent = "PAUSE"; playButton.setAttribute("aria-label", "Pause monthly timeline"); playNext(firstIndex);
  }
  function patchGraphData(nextData) {
    const nextById = new Map(nextData.nodes.map((node) => [node.id, node]));
    graphData.nodes.forEach((node) => {
      const next = nextById.get(node.id); if (!next) return;
      Object.keys(next).forEach((key) => { if (!["x", "y", "z", "vx", "vy", "vz", "fx", "fy", "fz"].includes(key)) node[key] = next[key]; });
    });
  }
  function initializeGraph() {
    if (typeof window.ForceGraph3D !== "function") { setRendererWarning(true); return false; }
    try {
      $("graph").replaceChildren(); delete window.alibiGraph; didFit = false;
      graph = new ForceGraph3D($("graph")).width(window.innerWidth).height(window.innerHeight)
        .backgroundColor("#0A0B0E").nodeRelSize(5).nodeVal((node) => Math.max(1, Number(node.total_value || 0) / 250000)).nodeColor((node) => BAND[node.band] || BAND.unknown)
        .nodeLabel((node) => `<div class="tip"><strong>${escapeHtml(node.legal_name || node.name)}</strong><br><span class="mono">${escapeHtml(node.gstin)}</span><br>score <span class="mono">${escapeHtml(node.score ?? "—")}</span></div>`)
        .nodeVisibility((node) => node.visible_at_selected_month).nodeOpacity(.93).linkColor((link) => EDGE[link.attribute] || EDGE.pan)
        .linkWidth((link) => link.attribute === "bank_account" ? 3 : link.attribute === "address" ? 2 : 1).linkOpacity(.45).linkCurvature((link) => link.attribute === "filing_ip" ? .08 : 0)
        .linkVisibility((link) => Boolean(link.source?.visible_at_selected_month && link.target?.visible_at_selected_month)).enablePointerInteraction(true).onNodeClick(openVendor)
        .onEngineStop(() => { if (!didFit && graph) { didFit = true; graph.zoomToFit(500, 95); } }).graphData(graphData);
      graph.d3Force("charge").strength(-220); graph.d3Force("link").distance(135); graph.cooldownTicks(100);
      window.alibiGraph = graph; setRendererWarning(false); return true;
    } catch (error) { console.error("Alibi WebGL graph failed.", error); graph = null; delete window.alibiGraph; setRendererWarning(true); return false; }
  }
  async function loadGraph(targetIndex = requestedIndex) {
    requestedIndex = targetIndex; const targetMonth = requestedMonth(), requestId = ++graphRequestId; clearAlert();
    setStatus("network loading", `Retrieving uploaded records for ${targetMonth}.`);
    try {
      const response = await fetch(`./api/graph?asof=${encodeURIComponent(targetMonth)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Graph request failed (${response.status})`);
      const data = await response.json(); if (requestId !== graphRequestId) return false;
      if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) throw new Error("Graph response was incomplete");
      if (!graphData) { graphData = data; if (!graph && !rendererUnavailable) initializeGraph(); }
      else patchGraphData(data);
      committedIndex = targetIndex; requestedIndex = targetIndex; applyCommittedMonth(firstCount); firstCount = false;
      timeline.disabled = false; playButton.disabled = false; vendorSelect.disabled = false; return true;
    } catch (error) {
      if (requestId !== graphRequestId) return false;
      console.error("Alibi graph data failed.", error); stopPlayback(); lastFailedIndex = targetIndex; requestedIndex = committedIndex; syncTimeline();
      if (!graphData) setStatus("network unavailable", `No uploaded records are available; ${targetMonth} could not be retrieved.`);
      else setStatus("network / prior records", `Records remain as of ${committedMonth()}; ${targetMonth} could not be retrieved.`);
      alertUser("Network update delayed", error.message, true); return false;
    }
  }
  function findingHtml(finding) {
    const severity = String(finding.severity || "unknown"), positive = severity === "positive";
    return `<div class="finding"><span class="severity${positive ? " positive" : ""}">${escapeHtml(severity)}</span><br>${escapeHtml(finding.message || "No message")}<br><span class="snapshot-hash">weight ${escapeHtml(finding.weight ?? "—")}</span></div>`;
  }
  function renderSelectedDrawer(focusClose) {
    const node = graphData?.nodes.find((item) => item.id === selectedVendorId); if (!node) { closeDrawer(); return; }
    const record = selectedVendorDetail || node, histories = Array.isArray(record.snapshots) ? record.snapshots.filter((item) => String(item.captured_at || "").slice(0, 7) <= committedMonth()).sort((a, b) => String(b.captured_at).localeCompare(String(a.captured_at))) : [];
    const findings = Array.isArray(node.findings) ? node.findings : [];
    const wasFocusedInDrawer = drawer.contains(document.activeElement);
    const historyHtml = detailLoading ? '<p class="empty-copy">Loading snapshot history…</p>' : detailError ? `<p class="empty-copy">Snapshot history unavailable. <button class="drawer-retry" type="button">Retry</button></p>` : histories.length ? histories.map((item) => `<div class="snapshot"><b>${escapeHtml(String(item.captured_at || "—").slice(0, 10))}</b> / ${escapeHtml(item.status || "—")}<br>returns current ${escapeHtml(item.returns_current ?? "—")}<br><span class="snapshot-hash">payload ${escapeHtml(item.payload_hash || "—")}<br>previous ${escapeHtml(item.prev_hash || "—")}</span></div>`).join("") : '<p class="empty-copy">No sealed snapshots recorded through this month.</p>';
    drawer.innerHTML = `<button class="drawer-close" type="button" aria-label="Close vendor record">CLOSE</button><p class="eyebrow">vendor diligence record / as of ${committedMonth()}</p><h2>${escapeHtml(record.legal_name || record.name || node.legal_name || node.name)}</h2><p class="identity">${escapeHtml(record.gstin || node.gstin)}<br>${escapeHtml(record.pan || node.pan || "PAN —")} / ${escapeHtml(record.state || node.state || "state —")}</p><section class="drawer-section"><h3>selected-month risk</h3><div class="metric-row"><span>score</span><b>${escapeHtml(node.score ?? "—")}</b></div><div class="metric-row"><span>band</span><b>${escapeHtml(node.band || "unknown")}</b></div><div class="metric-row"><span>registered</span><b>${escapeHtml(record.registered_on || node.registered_on || "—")}</b></div></section><section class="drawer-section"><h3>findings / selected month</h3>${findings.length ? findings.map(findingHtml).join("") : '<p class="empty-copy">No recorded findings for this selected month.</p>'}</section><section class="drawer-section"><h3>snapshot history / through ${committedMonth()}</h3>${historyHtml}</section>`;
    drawer.classList.add("open"); drawer.hidden = false; drawer.inert = false; drawer.setAttribute("aria-hidden", "false");
    drawer.querySelector(".drawer-close").addEventListener("click", closeDrawer); drawer.querySelector(".drawer-retry")?.addEventListener("click", () => fetchVendorDetail(selectedVendorId));
    if (focusClose || wasFocusedInDrawer) drawer.querySelector(".drawer-close").focus();
  }
  async function fetchVendorDetail(id) {
    const requestId = ++drawerRequestId; detailLoading = true; detailError = null; renderSelectedDrawer(false);
    try {
      const response = await fetch(`./api/vendor/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Vendor request failed (${response.status})`);
      const detail = await response.json();
      if (requestId !== drawerRequestId || id !== selectedVendorId || !drawer.classList.contains("open")) return;
      selectedVendorDetail = detail; detailLoading = false; renderSelectedDrawer(false);
    } catch (error) {
      if (requestId !== drawerRequestId || id !== selectedVendorId || !drawer.classList.contains("open")) return;
      console.error("Alibi vendor detail failed.", error); detailLoading = false; detailError = error.message; renderSelectedDrawer(false);
    }
  }
  function openVendor(node) { if (!node) return; const active = document.activeElement; lastFocused = active && active !== document.body && !drawer.contains(active) ? active : vendorSelect; selectedVendorId = node.id; selectedVendorDetail = null; detailLoading = true; detailError = null; vendorSelect.value = node.id; renderSelectedDrawer(true); fetchVendorDetail(node.id); }
  function closeDrawer() { drawerRequestId += 1; drawer.classList.remove("open"); drawer.hidden = true; drawer.inert = true; drawer.setAttribute("aria-hidden", "true"); selectedVendorId = null; selectedVendorDetail = null; detailLoading = false; if (lastFocused?.focus) lastFocused.focus(); }
  timeline.addEventListener("input", () => { stopPlayback(); loadGraph(Number(timeline.value)); });
  playButton.addEventListener("click", togglePlayback);
  vendorSelect.addEventListener("change", () => { const node = graphData?.nodes.find((item) => item.id === vendorSelect.value); if (node) openVendor(node); });
  $("retry").addEventListener("click", () => loadGraph(lastFailedIndex));
  $("retry-renderer").addEventListener("click", () => { if (graphData && !graph) initializeGraph(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });
  window.addEventListener("resize", () => { if (graph) graph.width(window.innerWidth).height(window.innerHeight); });
  syncTimeline(); loadGraph();
})();