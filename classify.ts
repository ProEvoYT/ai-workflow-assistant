import Anthropic from "@anthropic-ai/sdk";
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

const anthropic = new Anthropic({ apiKey: config.classify.anthropicApiKey });

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
  const response = await anthropic.messages.create({
    model: config.classify.model,
    max_tokens: 300,
    messages: [{ role: "user", content: buildPrompt(email) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text.trim());
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
