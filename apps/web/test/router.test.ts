import { describe, expect, it } from "vitest";
import { matchRoute } from "../src/router.js";

describe("matchRoute", () => {
  it("matches the root path to check", () => {
    expect(matchRoute("/")).toEqual({ name: "check", params: {} });
  });

  it("matches a check result by id", () => {
    expect(matchRoute("/checks/abc")).toEqual({ name: "result", params: { id: "abc" } });
  });

  it("decodes URI-encoded params", () => {
    expect(matchRoute("/vendors/x%20y")).toEqual({ name: "vendor", params: { id: "x y" } });
  });

  it("falls back to notfound for unknown deep paths", () => {
    expect(matchRoute("/nope/deep")).toEqual({ name: "notfound", params: {} });
  });
});
