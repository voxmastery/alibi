import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const vendorsScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Vendors");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Vendors" }), emptyState("This screen is being built."));
};
