import type { Screen } from "../state.js";
import { pageHeader } from "../ui/components.js";
import { el, link } from "../ui/dom.js";

export const notFoundScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Not found");
  root.append(
    pageHeader({ eyebrow: "Alibi", title: "Not found" }),
    el("p", null, "There is nothing at this address."),
    link("/", "Back to the check screen"),
  );
};
