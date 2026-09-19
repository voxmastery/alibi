---
name: WebGL verification limits
description: A browser capability limitation encountered when verifying Alibi's Three.js graph.
---

Do not assume the automated preview browser supports WebGL, or treat a clean JavaScript load as proof that the network rendered.

**Why:** On 2026-09-19, the screenshot browser and Chromium interaction checks failed to create a WebGL context with `BindToCurrentSequence failed`. Both SwiftShader and SwiftShader-WebGL launch configurations were attempted without success. This is evidence about those browser sessions, not proof that the graph fails in all user browsers.

**How to apply:** When verifying graph work, report actual visible spheres, links, mouse-orbit behavior, and hover labels separately. If context creation is unavailable, state that limitation instead of claiming visual success or repeatedly changing graph geometry to fix a browser capability problem.

Keep the 3D renderer rather than silently substituting a 2D canvas when this verification environment fails.

**Why:** On 2026-09-19, the user explicitly chose to continue with 3D and incomplete visual verification after being offered a 2D fallback or pausing. That choice permits implementation to continue; it does not establish that any rendering or interaction check passed.

**How to apply:** Keep data, counters, and controls usable independently of WebGL initialization where possible. Disclose unverified rendering honestly, and ask before replacing the renderer.