import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const resultScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Result");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Result" }), emptyState("This screen is being built."));
};
