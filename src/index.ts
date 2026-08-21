import { config } from "./config.js";
import { getAccessToken } from "./auth.js";
import { getMailFolderId, getMessages, type EmailSummary } from "./graph.js";
import { classifyEmail } from "./classify.js";
import { executeActions } from "./actions.js";
import { MOCK_EMAILS } from "./mockData.js";

/**
 * MILESTONE 1: authenticate, read real emails.            -- graph.ts
 * MILESTONE 2: classify each email into structured JSON,
 *              resolve a destination, flag low-confidence
 *              /unknown categories for review.              -- classify.ts
 * MILESTONE 3: act on it -- move the email, save its
 *              attachments to the resolved destination.      -- actions.ts
 *
 * MOCK MODE: run with `npm run start:mock` to use local sample data and
 * write real local files instead of touching Graph, when Microsoft
 * account/tenant access isn't sorted out yet. Only the data-source and
 * action-target branches change -- classify.ts and workflowMap.ts are
 * identical either way, so swapping back to real auth/Graph later is a
 * one-line change per branch, not a rewrite.
 */
async function getRunContext(): Promise<{ messages: EmailSummary[]; token: string | null }> {
  if (process.env.MOCK_MODE === "true") {
    console.log("Running in MOCK MODE -- using local sample emails, no Microsoft account needed.\n");
    return { messages: MOCK_EMAILS, token: null };
  }

  console.log(`Authenticating (tenant: ${config.ms.tenantId})...`);
  const token = await getAccessToken();
  console.log("Authenticated.\n");

  console.log(`Resolving test folder "${config.mail.testFolderName}"...`);
  const folderId = await getMailFolderId(token, config.mail.testFolderName);

  console.log("Fetching messages...\n");
  const messages = await getMessages(token, folderId);
  return { messages, token };
}

async function main() {
  const { messages, token } = await getRunContext();

  if (messages.length === 0) {
    console.log(
      `No messages found in "${config.mail.testFolderName}". Drop a few test emails in there and re-run.`
    );
    return;
  }

  for (const msg of messages) {
    console.log("──────────────────────────────────────");
    console.log(`From:      ${msg.from}`);
    console.log(`Subject:   ${msg.subject}`);
    console.log(
      `Attachments: ${msg.attachments.length > 0 ? msg.attachments.map((a) => a.name).join(", ") : "none"}`
    );

    const result = await classifyEmail(msg);

    if (!result) {
      console.log(`Classification: FAILED (malformed model output, skipping -- no action taken)`);
      continue;
    }

    console.log(`Priority:        ${result.priority.toUpperCase()}`);
    console.log(`Category:        ${result.category}`);
    console.log(`Document type:   ${result.documentType}`);
    console.log(`Action required: ${result.requiresAction ? "yes" : "no"}`);
    console.log(`Confidence:      ${result.confidence.toFixed(2)}`);
    console.log(
      `Destination:     ${result.needsReview ? `${result.destination} (⚠ NEEDS REVIEW)` : result.destination}`
    );

    try {
      const outcome = await executeActions(msg, result, token);
      console.log(`Filed to:        ${outcome.movedTo}`);
      if (outcome.attachmentsSaved.length > 0) {
        console.log(`Attachments saved:`);
        for (const p of outcome.attachmentsSaved) console.log(`  - ${p}`);
      }
    } catch (err: any) {
      console.log(`Action FAILED:   ${err.message ?? err} (classification stands, filing did not complete)`);
    }
  }
  console.log("──────────────────────────────────────");
  console.log(`\n${messages.length} message(s) processed.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});