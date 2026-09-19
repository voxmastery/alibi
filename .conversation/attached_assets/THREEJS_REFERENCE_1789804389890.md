# ALIBI — Three.js Library Reference

**Replaces Block 3 in `REPLIT_PROMPT.md`.** Paste this file into Replit instead.

---

## The library

**`3d-force-graph`** by Vasco Asturiano — MIT licensed.
Repo: `https://github.com/vasturiano/3d-force-graph`
Docs: `https://vasturiano.github.io/3d-force-graph`
~5.3k stars, **version 1.80.0**. A UI component for graph data in 3D space, built with ThreeJS and the d3-force-3d layout engine.

We use this rather than raw Three.js because it gives us force layout, camera controls, raycasting and hit detection for free. Hand-rolling any of that would cost the afternoon.

### CDN — use exactly this

```html
<script src="//cdn.jsdelivr.net/npm/3d-force-graph"></script>
```

Pin the version if you want determinism:
```html
<script src="//cdn.jsdelivr.net/npm/3d-force-graph@1.80.0"></script>
```

---

## ⚠️ Two things that will cost you an hour if you get them wrong

### 1. The constructor form changed

Current documented usage:
```js
const myGraph = new ForceGraph3D(document.getElementById('my-element'))
  .graphData(myData);
```

The **old curried form** — `ForceGraph3D()(element)` — appears all over older examples and blog posts. If Replit Agent writes that, correct it immediately. Most models trained before the change will default to the old form.

### 2. Do NOT load three.js separately

There is a known issue (vasturiano/3d-force-graph#111) where combining a separate `<script src="//unpkg.com/three">` tag with `.linkWidth()` throws `Uncaught TypeError: parent.updateWorldMatrix is not a function`.

`3d-force-graph` bundles its own Three.js. Loading another copy gives you two instances of the library and broken matrix math. **One script tag, nothing else.**

---

## Verified API surface

These method names are from the library's own documentation. Everything else Agent suggests should be checked against `https://vasturiano.github.io/3d-force-graph` before you trust it.

### Data
| Method | Purpose | Default |
|---|---|---|
| `graphData([data])` | Set/get `{nodes, links}`. Also applies incremental updates. | `{nodes:[], links:[]}` |
| `jsonUrl([url])` | Load graph data from a URL instead | |
| `nodeId([str])` | Node accessor for unique id | `id` |
| `linkSource([str])` | Link accessor for source node id | `source` |
| `linkTarget([str])` | Link accessor for target node id | `target` |

### Node styling
| Method | Purpose | Default |
|---|---|---|
| `nodeRelSize([num])` | Sphere volume per value unit | `4` |
| `nodeVal([num\|str\|fn])` | Numeric value driving volume | `val` |
| `nodeLabel([str\|fn])` | Hover label — accepts text, HTML, or an HTMLElement | |
| `nodeColor([str\|fn])` | Sphere colour | `color` |
| `nodeVisibility([bool\|str\|fn])` | Show/hide a node | `true` |
| `nodeAutoColorBy([str\|fn])` | Auto-colour by attribute | |
| `nodeOpacity([num])` | Sphere opacity | |

### Link styling
| Method | Purpose |
|---|---|
| `linkColor([str\|fn])` | Link colour |
| `linkWidth([num\|str\|fn])` | Link thickness |
| `linkOpacity([num])` | Link opacity |

### Interaction & container
| Method | Purpose |
|---|---|
| `onNodeClick(fn)` | Click handler, receives the node object |
| `enablePointerInteraction([bool\|fn])` | Toggle mouse tracking |
| `width([px])` / `height([px])` | Canvas dimensions (default: window size) |

### Data shape

```json
{
  "nodes": [
    { "id": "id1", "name": "name1", "val": 1 },
    { "id": "id2", "name": "name2", "val": 10 }
  ],
  "links": [
    { "source": "id1", "target": "id2" }
  ]
}
```

Note `nodeVisibility` — that's how the time scrubber hides vendors that weren't registered yet, without rebuilding the scene.

---

## BLOCK 3 (corrected) — paste this into Replit

```
Build the main screen: a full-bleed 3D force-directed graph.

Load ONE script tag, nothing else:
  <script src="//cdn.jsdelivr.net/npm/3d-force-graph@1.80.0"></script>

Do NOT add a separate three.js script tag. The library bundles its own Three.js and
loading a second copy breaks .linkWidth() with "parent.updateWorldMatrix is not a
function". This is a known issue.

Use the CONSTRUCTOR form, not the curried form:
  const graph = new ForceGraph3D(document.getElementById('graph'));
NOT: ForceGraph3D()(element)  <- old API, will not work

Reference implementation to adapt:

  const BAND = {
    clear:   '#2DD4A7',
    watch:   '#F5A524',
    flagged: '#FF4D4D',
    unknown: '#555A66'
  };

  const EDGE = {
    bank_account: '#FF4D4D',
    address:      '#FF8A65',
    filing_ip:    '#FFB74D',
    phone:        '#7E9BFF',
    email:        '#9C7EFF',
    pan:          '#3A4050'
  };

  const graph = new ForceGraph3D(document.getElementById('graph'))
    .backgroundColor('#0A0B0E')
    .nodeRelSize(5)
    .nodeVal(n => Math.max(1, n.total_value / 250000))
    .nodeColor(n => BAND[n.band])
    .nodeLabel(n => `<div class="tip">
        <strong>${n.legal_name}</strong><br>
        <span class="mono">${n.gstin}</span><br>
        score ${n.score}
      </div>`)
    .nodeVisibility(n => n.visible_at_selected_month)
    .linkColor(l => EDGE[l.attribute] || '#3A4050')
    .linkWidth(l => l.attribute === 'bank_account' ? 3
                  : l.attribute === 'address'      ? 2
                  : 1)
    .linkOpacity(0.45)
    .onNodeClick(n => openDrawer(n.id));

Fetch GET /api/graph?asof=YYYY-MM and pass the result to .graphData().

Overlay UI, absolutely positioned above the canvas, never blocking the centre:
  - Top-left: three counters — "Vendors tracked", "Snapshots sealed", "ITC exposed (Rs)".
    Count up over 800ms on load.
  - Top-right: risk band legend, small, monospace.
  - Bottom-centre: reserve space for the time scrubber (Block 4).

All numeric content and all GSTINs/hashes in monospace. No exceptions.
Only one accent colour beyond the risk bands: #2DD4A7.

Verify the graph renders with static data before wiring the scrubber.
```

---

## BLOCK 4 addendum — how the scrubber updates

Do **not** call `.graphData()` with a whole new object on every month step; that resets the physics simulation and the layout jumps.

Two cleaner options:

**Option A — visibility toggling (preferred).** Load the full node and link set once. On each month step, mutate each node's `band` and `visible_at_selected_month` in place, then call `.nodeColor(...)` and `.nodeVisibility(...)` again to force a re-evaluation. The layout stays stable and only colours change — which is exactly the effect you want on stage.

**Option B — incremental update.** `graphData()` can apply incremental updates, but the layout will still settle. Only use this if nodes genuinely need to appear or disappear.

Start with A. It's less code and it demos better because the cluster doesn't move while it turns red.

---

## Fallback plan

If the graph isn't rendering by **13:30**, stop.

`three-forcegraph` (`//cdn.jsdelivr.net/npm/three-forcegraph`) is the underlying ThreeJS class if you ever want to drop into a custom scene — but that's *more* work, not less. It is not your fallback.

Your fallback is a 2D canvas with circles and lines, and **keep the time scrubber**. The scrubber is the idea. The third dimension is presentation.

---

## Related packages (context only — don't use today)

| Package | What it is |
|---|---|
| `3d-force-graph` | What you're using — WebGL 3D |
| `three-forcegraph` | The underlying ThreeJS class, for custom scenes |
| `react-force-graph` | React bindings |
| `3d-force-graph-vr` | A-Frame VR version |
| `3d-force-graph-ar` | AR.js version |

---

## Honest caveat

The method names and CDN paths above come from the library's published documentation. The reference code block is **written to that API, not tested in this environment.** Run it against 5 nodes before you build the real thing on top of it — if `nodeVal` or `nodeVisibility` behave differently than expected, you want to find that out at 11 AM, not at 4.
