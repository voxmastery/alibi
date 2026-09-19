import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const checkScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Check");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Check" }), emptyState("This screen is being built."));
};
