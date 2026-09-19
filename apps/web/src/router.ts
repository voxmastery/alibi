export type Params = Record<string, string>;
export interface RouteMatch { name: string; params: Params }

const ROUTES: Array<[RegExp, string, string[]]> = [
  [/^\/$/, "check", []],
  [/^\/checks\/([^/]+)$/, "result", ["id"]],
  [/^\/vendors$/, "vendors", []],
  [/^\/vendors\/([^/]+)$/, "vendor", ["id"]],
  [/^\/network$/, "network", []],
  [/^\/defence\/([^/]+)$/, "defence", ["id"]],
  [/^\/verify$/, "verify", []],
  [/^\/alerts$/, "alerts", []],
];

export function matchRoute(pathname: string): RouteMatch {
  for (const [pattern, name, keys] of ROUTES) {
    const m = pattern.exec(pathname);
    if (!m) continue;
    const params: Params = {};
    keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1] ?? ""); });
    return { name, params };
  }
  return { name: "notfound", params: {} };
}

export function startRouter(onChange: (match: RouteMatch) => void): { navigate(path: string): void } {
  const fire = () => onChange(matchRoute(window.location.pathname));
  const navigate = (path: string) => { window.history.pushState({}, "", path); fire(); };
  window.addEventListener("popstate", fire);
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest("a[data-link]") as HTMLAnchorElement | null;
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    navigate(anchor.getAttribute("href") ?? "/");
  });
  fire();
  return { navigate };
}
