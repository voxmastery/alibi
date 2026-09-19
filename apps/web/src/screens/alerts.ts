import type { Screen } from "../state.js";
import { emptyState, pageHeader } from "../ui/components.js";

export const alertsScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Alerts");
  root.append(pageHeader({ eyebrow: "Alibi", title: "Alerts" }), emptyState("This screen is being built."));
};
