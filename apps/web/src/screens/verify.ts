import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const verifyScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Verify");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Verify" }), emptyState("This screen is being built."));
};
