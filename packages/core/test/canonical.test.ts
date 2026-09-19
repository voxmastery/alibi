import { describe, expect, it } from "vitest";
import { canonicalJson } from "@alibi/core";

const BS = String.fromCharCode(92); // backslash
const QUOTE = String.fromCharCode(34);
const EURO = String.fromCharCode(0x20ac);
const SI = String.fromCharCode(0x0f);
const LF = String.fromCharCode(10);

describe("canonicalJson (RFC 8785)", () => {
  it("reproduces the RFC 8785 section 3.2.3 example byte for byte", () => {
    // The RFC input, decoded: euro, $, U+000F, LF, A, ', B, ", backslash, backslash, ", /
    const input = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: EURO + "$" + SI + LF + "A'B" + QUOTE + BS + BS + QUOTE + "/",
      literals: [null, true, false],
    };
    const expected =
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"' +
      EURO + "$" + BS + "u000f" + BS + "nA'B" + BS + QUOTE + BS + BS + BS + BS + BS + QUOTE + '/"}';
    expect(canonicalJson(input)).toBe(expected);
  });

  it("sorts object keys by UTF-16 code units, so the emoji precedes the Hebrew letter", () => {
    const CR = String.fromCharCode(13);
    const CONTROL = String.fromCharCode(0x80);
    const O_DIAERESIS = String.fromCharCode(0xf6);
    const EMOJI = String.fromCodePoint(0x1f600);
    const DALET = String.fromCharCode(0xfb33);
    const input: Record<string, string> = {};
    input[EURO] = "Euro Sign";
    input[CR] = "Carriage Return";
    input[DALET] = "Hebrew Letter Dalet With Dagesh";
    input["1"] = "One";
    input[EMOJI] = "Emoji: Grinning Face";
    input[CONTROL] = "Control";
    input[O_DIAERESIS] = "Latin Small Letter O With Diaeresis";
    const out = canonicalJson(input);
    const order = [CR, "1", CONTROL, O_DIAERESIS, EURO, EMOJI, DALET];
    const positions = order.map((k) => out.indexOf(JSON.stringify(k) + ":"));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("is insensitive to key order and whitespace of the source", () => {
    const a = JSON.parse('{"b": 1, "a": {"y": [1, 2], "x": null}}');
    const b = JSON.parse('{ "a":{"x":null,"y":[1,2]},"b":1 }');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"x":null,"y":[1,2]},"b":1}');
  });

  it("serialises numbers the ES6 way", () => {
    expect(canonicalJson([1.0, 100, 1e21, 1e-7, -0, 0.1 + 0.2])).toBe("[1,100,1e+21,1e-7,0,0.30000000000000004]");
  });

  it("keeps non-ASCII characters unescaped", () => {
    expect(canonicalJson({ name: "Sundaram " + EURO })).toBe('{"name":"Sundaram ' + EURO + '"}');
  });

  it("rejects values JSON cannot carry", () => {
    expect(() => canonicalJson([Number.NaN])).toThrow(TypeError);
    expect(() => canonicalJson([Number.POSITIVE_INFINITY])).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined as unknown as null })).toThrow(TypeError);
  });
});
