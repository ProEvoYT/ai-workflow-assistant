import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";
import { VALID_CATEGORIES, resolveDestination } from "./workflowMap.js";
import type { EmailSummary } from "./graph.js";

export interface ClassificationResult {
  priority: "high" | "medium" | "low";
  category: string;
  documentType: string;
  requiresAction: boolean;
  confidence: number;
  destination: string;
  needsReview: boolean;
}

const ai = new GoogleGenAI({ apiKey: config.classify.geminiApiKey });

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for errors worth retrying: rate limits and transient server overload. */
function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /"code":\s*(429|503)/.test(message) || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message);
}

/**
 * Google's 429 responses include a RetryInfo block with a suggested
 * wait time (e.g. "retryDelay":"46s") -- specifically for free-tier
 * per-minute quota resets, which can be far longer than a generic
 * exponential backoff would guess. Use it when present; fall back to
 * the exponential schedule otherwise (e.g. for 503 overload, which
 * doesn't come with a specific wait time).
 */
function parseSuggestedDelayMs(err: unknown): number | null {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return null;
  return Math.ceil(parseFloat(match[1]) * 1000) + 500; // small buffer past the suggested wait
}

/**
 * Proactively paces requests to stay under the free-tier quota
 * (default 5/minute), instead of only reacting after a 429 already
 * happened. Tracks a rolling 60s window of request timestamps; if the
 * window is full, waits just long enough for the oldest request to
 * age out before sending the next one.
 */
const requestTimestamps: number[] = [];

async function waitForRateLimitSlot(): Promise<void> {
  const limit = config.classify.maxRequestsPerMinute;
  const windowMs = 60_000;
  const now = Date.now();

  while (requestTimestamps.length && now - requestTimestamps[0] > windowMs) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= limit) {
    const waitMs = windowMs - (now - requestTimestamps[0]) + 250;
    console.log(`  (pacing requests to stay under the ${limit}/min quota -- waiting ${(waitMs / 1000).toFixed(1)}s)`);
    await sleep(waitMs);
  }

  requestTimestamps.push(Date.now());
}

/**
 * Calls the model with retry + exponential backoff for transient errors
 * (429 rate limit, 503 overloaded) -- common on free-tier traffic, and
 * not a reason to fail an entire run over one busy moment upstream.
 * Non-retryable errors (bad API key, invalid request) fail immediately.
 */
async function generateWithRetry(prompt: string): Promise<string | undefined> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await waitForRateLimitSlot();
      const response = await ai.models.generateContent({
        model: config.classify.model,
        contents: prompt,
      });
      return response.text;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt === MAX_RETRIES) throw err;

      const suggested = parseSuggestedDelayMs(err);
      const delay = suggested ?? BASE_DELAY_MS * 2 ** attempt;
      console.log(`  (model busy, retrying in ${delay / 1000}s -- attempt ${attempt + 1}/${MAX_RETRIES})`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function buildPrompt(email: EmailSummary): string {
  const attachmentList =
    email.attachments.length > 0
      ? email.attachments.map((a) => `- ${a.name} (${a.contentType})`).join("\n")
      : "(none)";

  return `Classify this workplace email. Respond with ONLY a JSON object, no other text, no markdown fences.

Schema:
{
  "priority": "high" | "medium" | "low",
  "category": one of [${VALID_CATEGORIES.map((c) => `"${c}"`).join(", ")}],
  "document_type": short string, e.g. "invoice", "contract", "resume", "report", "none",
  "requires_action": boolean,
  "confidence": number between 0 and 1, your confidence in this classification
}

Email:
From: ${email.from}
Subject: ${email.subject}
Preview: ${email.bodyPreview}
Attachments:
${attachmentList}`;
}

/**
 * Validates the shape of the model's parsed JSON before we trust it.
 * Returns null (rather than throwing) on malformed output so the caller
 * can decide to skip/retry/flag rather than crash the whole run.
 */
function validate(raw: unknown): Omit<ClassificationResult, "destination" | "needsReview"> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const priority = r.priority;
  const category = r.category;
  const documentType = r.document_type;
  const requiresAction = r.requires_action;
  const confidence = r.confidence;

  if (priority !== "high" && priority !== "medium" && priority !== "low") return null;
  if (typeof category !== "string") return null;
  if (typeof documentType !== "string") return null;
  if (typeof requiresAction !== "boolean") return null;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) return null;

  return {
    priority,
    category,
    documentType,
    requiresAction,
    confidence,
  };
}

export async function classifyEmail(email: EmailSummary): Promise<ClassificationResult | null> {
  const text = await generateWithRetry(buildPrompt(email));
  if (!text) return null;

  // Gemini sometimes wraps JSON in ```json fences despite instructions
  // not to -- strip them defensively rather than failing the whole run.
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const validated = validate(parsed);
  if (!validated) return null;

  const belowThreshold = validated.confidence < config.classify.confidenceThreshold;
  const unknownCategory = !VALID_CATEGORIES.includes(validated.category as any);

  return {
    ...validated,
    destination: resolveDestination(validated.category),
    needsReview: belowThreshold || unknownCategory,
  };
}