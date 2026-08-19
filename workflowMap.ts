/**
 * The AI decides WHAT something is (category). This file decides WHERE
 * that maps to (destination). Keeping these separate means:
 *
 *   1. The LLM's output stays a small, constrained enum -- easy to
 *      validate and hard for it to drift into inconsistent formatting.
 *   2. When MTN gives you real folder/site names, you edit this file
 *      (or swap it for a lookup against SharePoint site IDs later),
 *      not the prompt or the classification logic.
 *
 * VALID_CATEGORIES is the source of truth the classifier prompt is
 * built from -- add a category here and it automatically becomes
 * something the model is allowed to choose.
 */

export const WORKFLOW_MAP: Record<string, string> = {
  finance: "Finance/Invoices",
  hr: "HR/Documents",
  legal: "Legal/Contracts",
  procurement: "Procurement/Orders",
  customer: "Customer-Service/Correspondence",
  other: "General/Unsorted",
};

export const VALID_CATEGORIES = Object.keys(WORKFLOW_MAP) as ReadonlyArray<
  keyof typeof WORKFLOW_MAP
>;

export const NEEDS_REVIEW_DESTINATION = "Needs-Review";

/**
 * Resolves a category to its destination path. Falls back to the
 * needs-review bucket for anything unrecognized, rather than guessing
 * or crashing -- an unknown category should never silently vanish.
 */
export function resolveDestination(category: string): string {
  return WORKFLOW_MAP[category] ?? NEEDS_REVIEW_DESTINATION;
}
