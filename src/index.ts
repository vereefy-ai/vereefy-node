/**
 * VEREEFY Node.js SDK v1.0
 *
 * Verwendung:
 *   import { Verefy, Hasher } from "@vereefy/sdk";
 *   const v = new Verefy({ apiKey: "vfy_..." });
 *   const nachweis = await v.logInteraction({
 *     provider: "openai", modelName: "gpt-4o",
 *     purpose: "Kundenberatung Retail-Banking",
 *     sector: "financial_services",
 *     inputContent: nachrichten,
 *     outputContent: antwort,
 *   });
 */

import { createHash } from "node:crypto";

export const SDK_VERSION = "1.0.1";
const DEFAULT_API_URL = "https://api.vereefy.ai";

// ── Typen ─────────────────────────────────────────────────────────────────

export interface ComplianceEvidence {
  interactionId: string;
  riskClass: string;
  articleMatches: string[];
  requiredActions: string[];
  requiredDisclosures: string[];
  regulatoryFlags: string[];
  confidence: string;
  complianceScore: number;
  auditEntryId: string;
  chainTipHash: string;
  timestamp: string;
  classificationVersion: string;
  policyVersion: string;
}

export interface LogInteractionOptions {
  provider: string;
  modelName: string;
  purpose: string;
  sector: string;
  /** Pass raw content OR a pre-computed hash — never both. */
  inputContent?: unknown;
  inputHash?: string;
  outputContent?: unknown;
  outputHash?: string;
  modelVersion?: string;
  interactionType?: string;
  customerFacing?: boolean;
  automationLevel?: string;
  decisionImpact?: string;
  userRole?: string;
  jurisdiction?: string;
  externalRef?: string;
  responseTimeMs?: number;
  extraData?: Record<string, unknown>;
}

export interface VerefyOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

// ── Hasher ────────────────────────────────────────────────────────────────

/**
 * Client-seitiges Hashing. Rohinhalte verlassen nie Ihre Umgebung.
 * Identische Algorithmen wie Python SDK (cross-language kompatibel).
 */
export class Hasher {
  static canonicalHash(content: unknown): string {
    if (content === null || content === undefined) {
      return createHash("sha256").update("null").digest("hex");
    }
    if (Buffer.isBuffer(content)) {
      return createHash("sha256").update(content).digest("hex");
    }
    if (typeof content === "string") {
      return createHash("sha256")
        .update(content.trim(), "utf8")
        .digest("hex");
    }
    if (typeof content === "object" || Array.isArray(content)) {
      const canonical = JSON.stringify(
        content,
        Object.keys(content as object).sort(),
        // JSON.stringify sortiert nicht automatisch — separater Schritt nötig
      );
      // sort_keys=True wie Python: deepSortKeys
      const c = Hasher._deepSortJson(content);
      return createHash("sha256").update(c, "utf8").digest("hex");
    }
    return createHash("sha256")
      .update(String(content), "utf8")
      .digest("hex");
  }

  static hashMessages(messages: Array<{ role: string; content: string }>): string {
    const normalized = messages.map((m) => ({
      role: m.role ?? "",
      content: m.content ?? "",
    }));
    return Hasher.canonicalHash(normalized);
  }

  /** json.dumps(sort_keys=True, ensure_ascii=True, separators=(',',':')) */
  private static _deepSortJson(value: unknown): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
      return Hasher._ensureAsciiString(value);
    }
    if (Array.isArray(value)) {
      return "[" + value.map((v) => Hasher._deepSortJson(v)).join(",") + "]";
    }
    if (typeof value === "object") {
      const keys = Object.keys(value as object).sort();
      const pairs = keys.map(
        (k) =>
          Hasher._ensureAsciiString(k) +
          ":" +
          Hasher._deepSortJson((value as Record<string, unknown>)[k]),
      );
      return "{" + pairs.join(",") + "}";
    }
    return Hasher._ensureAsciiString(String(value));
  }

  /** JSON.stringify + escape non-ASCII as \uXXXX (Python ensure_ascii=True) */
  private static _ensureAsciiString(s: string): string {
    // JSON.stringify handles all control chars, backslash, quotes
    const jsJson = JSON.stringify(s); // → "..." with escaping
    // Additionally escape any non-ASCII (code >= 0x80) that JSON.stringify left through
    return jsJson.replace(/[\u0080-￿]/g, (c) => {
      const code = c.charCodeAt(0);
      return "\\u" + code.toString(16).padStart(4, "0");
    });
  }
}

// ── Errors ────────────────────────────────────────────────────────────────

export class VerefyError extends Error {}

export class VerefyAPIError extends VerefyError {
  constructor(
    public readonly statusCode: number,
    public readonly detail: string,
  ) {
    super(`VEREEFY API ${statusCode}: ${detail}`);
    this.name = "VerefyAPIError";
  }
}

export class VerefyConnectionError extends VerefyError {
  constructor(message: string) {
    super(message);
    this.name = "VerefyConnectionError";
  }
}

export class VerefyValidationError extends VerefyError {
  constructor(message: string) {
    super(message);
    this.name = "VerefyValidationError";
  }
}

// ── Verefy-Client ─────────────────────────────────────────────────────────

export class Verefy {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(options: VerefyOptions) {
    if (!options.apiKey.startsWith("vfy_")) {
      throw new VerefyValidationError("API-Schlüssel muss mit 'vfy_' beginnen.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? 15_000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  private async _request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = this.baseUrl + path;
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
      "X-SDK-Version": SDK_VERSION,
    };
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const signal = AbortSignal.timeout(this.timeout);
        const resp = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal,
        });
        if (resp.status < 500) return resp;
        const text = await resp.text();
        lastErr = new VerefyAPIError(resp.status, text);
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        }
      } catch (e) {
        lastErr = new VerefyConnectionError(String(e));
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        }
      }
    }
    throw lastErr!;
  }

  async logInteraction(opts: LogInteractionOptions): Promise<ComplianceEvidence> {
    let inputHash: string;
    if (opts.inputContent !== undefined) {
      inputHash = Hasher.canonicalHash(opts.inputContent);
    } else if (opts.inputHash !== undefined) {
      inputHash = opts.inputHash;
    } else {
      throw new VerefyValidationError("inputContent oder inputHash angeben.");
    }

    let outputHash: string;
    if (opts.outputContent !== undefined) {
      outputHash = Hasher.canonicalHash(opts.outputContent);
    } else if (opts.outputHash !== undefined) {
      outputHash = opts.outputHash;
    } else {
      throw new VerefyValidationError("outputContent oder outputHash angeben.");
    }

    const payload: Record<string, unknown> = {
      provider: opts.provider,
      model_name: opts.modelName,
      purpose: opts.purpose,
      sector: opts.sector,
      input_hash: inputHash,
      output_hash: outputHash,
    };
    if (opts.modelVersion !== undefined) payload.model_version = opts.modelVersion;
    if (opts.interactionType !== undefined) payload.interaction_type = opts.interactionType;
    if (opts.customerFacing !== undefined) payload.customer_facing = opts.customerFacing;
    if (opts.automationLevel !== undefined) payload.automation_level = opts.automationLevel;
    if (opts.decisionImpact !== undefined) payload.decision_impact = opts.decisionImpact;
    if (opts.userRole !== undefined) payload.user_role = opts.userRole;
    if (opts.jurisdiction !== undefined) payload.jurisdiction = opts.jurisdiction;
    if (opts.externalRef !== undefined) payload.external_ref = opts.externalRef;
    if (opts.responseTimeMs !== undefined) payload.response_time_ms = opts.responseTimeMs;
    if (opts.extraData !== undefined) payload.extra_data = opts.extraData;

    const resp = await this._request("POST", "/v1/interactions", payload);
    if (resp.status === 201) {
      const data = await resp.json() as Record<string, unknown>;
      return this._mapEvidence(data);
    }
    const err = await resp.json().catch(() => ({ detail: resp.statusText })) as Record<string, unknown>;
    throw new VerefyAPIError(resp.status, String(err.detail ?? resp.statusText));
  }

  async getInteraction(interactionId: string): Promise<Record<string, unknown>> {
    const resp = await this._request("GET", `/v1/interactions/${interactionId}`);
    if (resp.status === 200) return resp.json() as Promise<Record<string, unknown>>;
    throw new VerefyAPIError(resp.status, await resp.text());
  }

  async verifyChain(interactionId: string): Promise<Record<string, unknown>> {
    const resp = await this._request("GET", `/v1/audit/${interactionId}/chain`);
    if (resp.status === 200) return resp.json() as Promise<Record<string, unknown>>;
    throw new VerefyAPIError(resp.status, await resp.text());
  }

  async requestReport(options: {
    reportType?: string;
    dateFrom?: string;
    dateTo?: string;
    interactionIds?: string[];
    format?: string;
  } = {}): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      report_type: options.reportType ?? "eu_ai_act",
      format: options.format ?? "json",
    };
    if (options.dateFrom) payload.date_from = options.dateFrom;
    if (options.dateTo) payload.date_to = options.dateTo;
    if (options.interactionIds) payload.interaction_ids = options.interactionIds;

    const resp = await this._request("POST", "/v1/reports", payload);
    if (resp.status === 200 || resp.status === 202) {
      return resp.json() as Promise<Record<string, unknown>>;
    }
    throw new VerefyAPIError(resp.status, await resp.text());
  }

  async getReport(reportId: string): Promise<Record<string, unknown>> {
    const resp = await this._request("GET", `/v1/reports/${reportId}`);
    if (resp.status === 200) return resp.json() as Promise<Record<string, unknown>>;
    throw new VerefyAPIError(resp.status, await resp.text());
  }

  private _mapEvidence(data: Record<string, unknown>): ComplianceEvidence {
    return {
      interactionId: String(data.interaction_id),
      riskClass: String(data.risk_class),
      articleMatches: (data.article_matches as string[]) ?? [],
      requiredActions: (data.required_actions as string[]) ?? [],
      requiredDisclosures: (data.required_disclosures as string[]) ?? [],
      regulatoryFlags: (data.regulatory_flags as string[]) ?? [],
      confidence: String(data.confidence),
      complianceScore: Number(data.compliance_score),
      auditEntryId: String(data.audit_entry_id),
      chainTipHash: String(data.chain_tip_hash),
      timestamp: String(data.timestamp),
      classificationVersion: String(data.classification_version),
      policyVersion: String(data.policy_version),
    };
  }
}
