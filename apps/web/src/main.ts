import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";
import "./styles/print.css";
import { getMode } from "./api.js";
import { chooseRenderer, probeWebgl } from "./renderer.js";
import { startRouter } from "./router.js";
import type { AppContext, Cleanup, Screen } from "./state.js";
import { checkScreen } from "./screens/check.js";
import { resultScreen } from "./screens/result.js";
import { vendorsScreen } from "./screens/vendors.js";
import { vendorScreen } from "./screens/vendor.js";
import { networkScreen } from "./screens/network.js";
import { defenceScreen } from "./screens/defence.js";
import { verifyScreen } from "./screens/verify.js";
import { alertsScreen } from "./screens/alerts.js";
import { notFoundScreen } from "./screens/notfound.js";

const screens: Record<string, Screen> = {
  check: checkScreen, result: resultScreen, vendors: vendorsScreen, vendor: vendorScreen,
  network: networkScreen, defence: defenceScreen, verify: verifyScreen, alerts: alertsScreen, notfound: notFoundScreen,
};

async function boot(): Promise<void> {
  const decision = chooseRenderer({
    search: window.location.search,
    webglAvailable: probeWebgl(document),
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  document.documentElement.dataset.renderer = decision.choice;
  document.documentElement.dataset.rendererReason = decision.reason;

  const mode = await getMode().catch(() => ({ sample: true, provider: "none" as const, banner: "The register could not be reached. Nothing shown here is live." }));
  const banner = document.getElementById("banner")!;
  if (mode.banner) { banner.textContent = mode.banner; banner.hidden = false; }
  document.getElementById("mode-note")!.textContent = mode.sample ? "Sample register" : "Live register";

  const root = document.getElementById("app")!;
  let cleanup: Cleanup | null = null;
  const ctx: AppContext = {
    mode, renderer: decision.choice,
    navigate: (path) => router.navigate(path),
    setTitle: (title) => { document.title = title ? `${title} · Alibi` : "Alibi"; },
  };
  const router = startRouter(async (match) => {
    cleanup?.(); cleanup = null;
    root.replaceChildren();
    document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => {
      const nav = a.dataset.nav;
      const active = (nav === "check" && (match.name === "check" || match.name === "result")) || nav === match.name || (nav === "vendors" && match.name === "vendor") || (nav === "vendors" && match.name === "defence");
      if (active) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    root.dataset.screen = match.name;
    const result = await (screens[match.name] ?? notFoundScreen)(root, match.params, ctx);
    if (typeof result === "function") cleanup = result;
    window.scrollTo(0, 0);
  });
}

void boot();
