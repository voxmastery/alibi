import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const vendorScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Vendor");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Vendor" }), emptyState("This screen is being built."));
};
