import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const networkScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Network");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Network" }), emptyState("This screen is being built."));
};
