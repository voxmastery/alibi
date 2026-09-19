import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const defenceScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Defence");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Defence" }), emptyState("This screen is being built."));
};
