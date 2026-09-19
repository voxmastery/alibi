/**
 * RFC 8785 JSON Canonicalization Scheme.
 * - Object keys sorted by UTF-16 code units (JavaScript's default string order).
 * - Numbers serialised with ES6 Number::toString (what JSON.stringify does).
 * - Strings escaped exactly as JSON.stringify escapes them.
 * - No whitespace.
 * The hash chain is computed over this string, so this function must never change behaviour.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonicalJson: NaN and Infinity cannot be represented in JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const child = value[key];
      if (child === undefined) {
        throw new TypeError(`canonicalJson: property "${key}" is undefined`);
      }
      parts.push(JSON.stringify(key) + ":" + canonicalJson(child));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
}
