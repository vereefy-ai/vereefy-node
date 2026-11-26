# @vereefy/sdk — Node.js

VEREEFY Node.js SDK für EU AI Act Compliance-Infrastruktur.

## Installation

```bash
npm install @vereefy/sdk
```

Node.js ≥ 18 erforderlich (natives `fetch` und `AbortSignal.timeout`).

## Schnellstart

```typescript
import { Verefy, Hasher } from "@vereefy/sdk";

const v = new Verefy({ apiKey: "vfy_..." });

const nachweis = await v.logInteraction({
  provider:     "openai",
  modelName:    "gpt-4o",
  purpose:      "Kundenberatung Retail-Banking",
  sector:       "financial_services",
  inputContent: messages,    // wird lokal gehasht — verlässt nie Ihre Umgebung
  outputContent: antwort,
});

console.log(nachweis.riskClass);       // z. B. "limited_risk"
console.log(nachweis.complianceScore); // 0–100
```

## Client-seitiges Hashing

Rohinhalt verlässt nie Ihre Umgebung — nur der SHA-256-Hash wird übermittelt.

```typescript
const h = Hasher.canonicalHash(meinObjekt);
await v.logInteraction({ inputHash: h, outputHash: h2, ... });
```

### Float-Verhalten: 1.0 vs. 1 (Node ≠ Python)

> **Dokumentierter Unterschied:** In JavaScript ist `1.0 === 1` — beide Werte haben denselben IEEE-754-Typ und `JSON.stringify` gibt `"1"` aus. In Python gibt `json.dumps({"x": 1.0})` `'{"x": 1.0}'` aus (mit Dezimalpunkt).

| Sprache | Eingabe       | JSON-Serialisierung | SHA-256 (erste 8 Zeichen) |
|---------|---------------|---------------------|---------------------------|
| Python  | `{"x": 1.0}`  | `{"x":1.0}`         | `bf32f562…`               |
| Node.js | `{ x: 1.0 }`  | `{"x":1}`           | `5041bf1f…`               |
| Node.js | `{ x: 1 }`    | `{"x":1}`           | `5041bf1f…`               |

**Workaround**, wenn Python-Kompatibilität für Float-Werte benötigt wird:
- Entweder den Hash auf Python-Seite berechnen und via `inputHash` übergeben.
- Oder den Float als String kodieren: `{ x: "1.0" }` (Absprache mit dem Gegenstück erforderlich).
- Oder `Hasher.canonicalHash` auf Python-Seite aufrufen und das Ergebnis direkt nutzen.

Nicht-ganzzahlige Floats (z. B. `1.5`, `3.14`) sind identisch in beiden Sprachen.

## Fehlerbehandlung

```typescript
import { VerefyAPIError, VerefyConnectionError, VerefyValidationError } from "@vereefy/sdk";

try {
  await v.logInteraction({ ... });
} catch (e) {
  if (e instanceof VerefyAPIError)        console.error(e.statusCode, e.detail);
  if (e instanceof VerefyConnectionError) console.error("Netzwerkfehler:", e.message);
  if (e instanceof VerefyValidationError) console.error("Eingabefehler:", e.message);
}
```

## Lizenz

MIT © VEREEFY AG
