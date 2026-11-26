/**
 * Cross-Language-Test-Vektoren für Hasher.canonicalHash.
 * Referenzwerte erzeugt mit Python SDK (vereefy/hasher.py canonical_hash).
 *
 * Ausführen: npm test
 */

import { Hasher } from "../src/index.js";

describe("Hasher.canonicalHash — cross-language Vektoren", () => {
  // Vektoren: [input, expectedHex]
  // Erzeugt mit:
  //   python3 -c "from vereefy import Hasher; print(Hasher.canonical_hash(<input>))"

  test("null/undefined → 'null'-Bytes", () => {
    // sha256("null") = 74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b
    expect(Hasher.canonicalHash(null)).toBe(
      "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    );
    expect(Hasher.canonicalHash(undefined)).toBe(
      "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b",
    );
  });

  test("String — stripped, UTF-8", () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(Hasher.canonicalHash("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    // Whitespace wird gestrippt
    expect(Hasher.canonicalHash("  hello  ")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  test("String leer", () => {
    // sha256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(Hasher.canonicalHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("Bytes / Buffer", () => {
    // sha256(bytes([0,1,2])) — Python-Referenzwert berechnet
    expect(Hasher.canonicalHash(Buffer.from([0, 1, 2]))).toBe(
      "ae4b3280e56e2faf83f414a6e3dabe9d5fbe18976544c05fed121accb85b53fc",
    );
  });

  test("Objekt — sort_keys, kein Leerzeichen, ASCII", () => {
    // json.dumps({"b":1,"a":2}, sort_keys=True, ensure_ascii=True, separators=(',',':'))
    // = '{"a":2,"b":1}'
    expect(Hasher.canonicalHash({ b: 1, a: 2 })).toBe(
      "d3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772",
    );
  });

  test("Array", () => {
    // json.dumps([1,2,3], ...) = '[1,2,3]'
    expect(Hasher.canonicalHash([1, 2, 3])).toBe(
      "a615eeaee21de5179de080de8c3052c8da901138406ba71c38c032845f7d54f4",
    );
  });

  test("Nested object — rekursive Key-Sortierung", () => {
    // {"z":{"b":1,"a":0},"a":true}
    // = '{"a":true,"z":{"a":0,"b":1}}'
    expect(Hasher.canonicalHash({ z: { b: 1, a: 0 }, a: true })).toBe(
      Hasher.canonicalHash({ a: true, z: { a: 0, b: 1 } }),
    );
  });

  test("Umlaut — ensure_ascii=True → \\uXXXX", () => {
    // Python: sha256(json.dumps("Hälfte", ensure_ascii=True, ...).encode())
    // = sha256('"H\\u00e4lfte"'.encode()) — trim hat keine Wirkung
    expect(Hasher.canonicalHash("Hälfte")).toBe(
      "abcb1eb6bf44c38dee21780c03c145ebac8bf69ed7556d2fbb5366a2dddcff00",
    );
  });

  test("Emoji — ensure_ascii=True → \\uXXXX surrogate pair", () => {
    // Python: sha256('"Hello \\ud83c\\udf0d"') — Erde-Emoji U+1F30D
    expect(Hasher.canonicalHash("Hello 🌍")).toBe(
      "6e2de92e24e019c3d3e5df9f616b0472f0b9a98925b8e4e6e576172545160c4a",
    );
  });

  test("Sonderzeichen — $, &, <tag> bleiben unescaped als String", () => {
    // JSON-String: '"Preis: 100 $ & <tag>"'
    expect(Hasher.canonicalHash("Preis: 100 $ & <tag>")).toBe(
      "6664ecece00669f3763f0b4c58c94beb80adbac7d32f1c726177b8d1f9f5c7f1",
    );
  });

  test("Mixed Unicode Object — Umlaut + Emoji Schlüssel+Wert", () => {
    // Python: json.dumps({"emoji":"🔑","name":"Müller"}, sort_keys=True, ensure_ascii=True, separators=(',',':'))
    // = '{"emoji":"\\ud83d\\udd11","name":"M\\u00fcller"}'
    expect(Hasher.canonicalHash({ name: "Müller", emoji: "🔑" })).toBe(
      "e341a496d13ed34e368a5cd43678905f0113ae9bb7f0a6ac3f320808c11dce8f",
    );
  });

  test("Float 1.0 — Python repr '1.0', JS repr '1' (dokumentierter Unterschied)", () => {
    // Python: json.dumps({"x": 1.0}) = '{"x": 1.0}' → sha256 bf32f562...
    // Node:   JSON.stringify({x: 1.0}) = '{"x":1}'   → sha256 5041bf1f...
    // Bewusste Abweichung: In JS ist 1.0 === 1 (kein Unterschied im IEEE 754-Typ).
    // Workaround: vorher als String übergeben oder inputHash manuell setzen.
    const nodeHash = Hasher.canonicalHash({ x: 1.0 });
    const intHash  = Hasher.canonicalHash({ x: 1 });
    // In Node sind 1.0 und 1 identisch → gleicher Hash
    expect(nodeHash).toBe(intHash);
    // Node-Wert (dokumentiert, abweichend von Python 'bf32f562...')
    expect(nodeHash).toBe(
      "5041bf1f713df204784353e82f6a4a535931cb64f1f4b4a5aeaffcb720918b22",
    );
  });

  test("Float 1.5 — Python und Node identisch", () => {
    // 1.5 ist nicht ganzzahlig → JSON.stringify gibt '1.5' (wie Python)
    expect(Hasher.canonicalHash({ x: 1.5 })).toBe(
      "461b06088af6528a5584517dd01a204856b291c4eead2bf678c9a6cc0e615623",
    );
  });

  test("Newline im String — korrekt escaped als \\n", () => {
    // Python: sha256('"line1\\nline2"') = sha256 683376e2...
    expect(Hasher.canonicalHash("line1\nline2")).toBe(
      "683376e290829b482c2655745caffa7a1dccfa10afaa62dac2b42dd6c68d0f83",
    );
  });

  test("hashMessages — normalisiert role + content", () => {
    const msgs = [
      { role: "user", content: "Hallo" },
      { role: "assistant", content: "Hallo!" },
    ];
    const h1 = Hasher.hashMessages(msgs);
    const h2 = Hasher.canonicalHash(msgs);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

describe("Verefy-Konstruktor Validierung", () => {
  test("Ungültiger API-Key wirft VerefyValidationError", async () => {
    const { Verefy, VerefyValidationError } = await import("../src/index.js");
    expect(() => new Verefy({ apiKey: "invalid" })).toThrow(VerefyValidationError);
  });

  test("Gültiger API-Key-Präfix wird akzeptiert", async () => {
    const { Verefy } = await import("../src/index.js");
    expect(() => new Verefy({ apiKey: "vfy_test_xxx" })).not.toThrow();
  });
});
