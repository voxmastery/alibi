---
name: Production startup parity
description: Publishing eligibility and differences between preview and production startup.
---

Validate the actual production launch from the workspace root, not only the preview's package-local start.

**Why:** Preview launches through pnpm inside the artifact directory, while publishing launches Node from the workspace root. A build can pass yet startup fail when resource loading assumes the preview working directory. Production runtime logs were unavailable during diagnosis, but the configured production command reproduced the failure locally.

**How to apply:** After resource-path or launch changes, check startup from both directories and verify the health route, HTML/assets, and data API. Keep resource paths independent of the working directory and compatible with the bundled output.

Do not assume that an API artifact serving HTML makes the project eligible for web publishing.

**Why:** An API plus a design canvas was reported as non-deployable even though Express served the complete interface. Registering a web artifact changed the workspace's eligibility to deployable. The user approved separating frontend registration and routing while retaining the existing vanilla frontend and Express API.

**How to apply:** Preserve an explicit web registration for the user-facing app. Distinguish a publishing-eligibility problem from a compilation or startup error; the former may block new attempts before build logs appear.