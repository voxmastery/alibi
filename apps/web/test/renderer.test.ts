import { describe, expect, it } from "vitest";
import { chooseRenderer } from "../src/renderer.js";

describe("chooseRenderer", () => {
  it("uses 3D when WebGL works and nothing objects", () => {
    expect(chooseRenderer({ search: "", webglAvailable: true, prefersReducedMotion: false })).toEqual({ choice: "3d", reason: "webgl_ok" });
  });

  it("?renderer=2d always wins", () => {
    expect(chooseRenderer({ search: "?renderer=2d", webglAvailable: true, prefersReducedMotion: false })).toEqual({ choice: "2d", reason: "forced_2d" });
  });

  it("falls back to 2D without a WebGL context, even when 3D is requested", () => {
    expect(chooseRenderer({ search: "", webglAvailable: false, prefersReducedMotion: false })).toEqual({ choice: "2d", reason: "no_webgl" });
    expect(chooseRenderer({ search: "?renderer=3d", webglAvailable: false, prefersReducedMotion: false })).toEqual({ choice: "2d", reason: "no_webgl" });
  });

  it("respects reduced motion unless 3D is explicitly requested", () => {
    expect(chooseRenderer({ search: "", webglAvailable: true, prefersReducedMotion: true })).toEqual({ choice: "2d", reason: "reduced_motion" });
    expect(chooseRenderer({ search: "?renderer=3d", webglAvailable: true, prefersReducedMotion: true })).toEqual({ choice: "3d", reason: "forced_3d" });
  });
});
