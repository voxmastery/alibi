export type RendererChoice = "3d" | "2d";
export type RendererReason = "forced_2d" | "forced_3d" | "reduced_motion" | "no_webgl" | "webgl_ok";

export interface RendererEnvironment {
  search: string;
  webglAvailable: boolean;
  prefersReducedMotion: boolean;
}

/**
 * Picks the renderer. Never claims 3D without a WebGL context; a forced 2D always wins
 * (that is how CI exercises the fallback); reduced-motion users get 2D unless they ask for 3D.
 */
export function chooseRenderer(env: RendererEnvironment): { choice: RendererChoice; reason: RendererReason } {
  const forced = new URLSearchParams(env.search).get("renderer");
  if (forced === "2d") return { choice: "2d", reason: "forced_2d" };
  if (!env.webglAvailable) return { choice: "2d", reason: "no_webgl" };
  if (forced === "3d") return { choice: "3d", reason: "forced_3d" };
  if (env.prefersReducedMotion) return { choice: "2d", reason: "reduced_motion" };
  return { choice: "3d", reason: "webgl_ok" };
}

/** Tries to create a WebGL context on a scratch canvas and releases it. */
export function probeWebgl(doc: Document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
