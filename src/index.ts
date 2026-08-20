import { config } from "./config.js";
import { getAccessToken } from "./auth.js";
import { getMailFolderId, getMessages, type EmailSummary } from "./graph.js";
import { classifyEmail } from "./classify.js";
import { MOCK_EMAILS } from "./mockData.js";

/**
 * MILESTONE 1: authenticate, read real emails.       -- done, see graph.ts
 * MILESTONE 2: classify each email into structured
 *              JSON via an LLM, resolve a destination
 *              from config, flag low-confidence /
 *              unknown categories for review.          -- this file
 *
 * Still does nothing else: no email moves, no file writes, no
 * notifications. That's Milestone 3.
 *
 * MOCK MODE: run with `npm run start:mock` to use local sample data
 * instead of Graph, when Microsoft account/tenant access isn't sorted
 * out yet. Only this file's data-source branch changes -- classify.ts,
 * workflowMap.ts, and everything downstream is identical either way, so
 * swapping back to real auth later is a one-line change, not a rewrite.
 */
async function getMessagesForRun(): Promise<EmailSummary[]> {
  if (process.env.MOCK_MODE === "true") {
    console.log("Running in MOCK MODE -- using local sample emails, no Microsoft account needed.\n");
    return MOCK_EMAILS;
  }

  console.log(`Authenticating (tenant: ${config.ms.tenantId})...`);
  const token = await getAccessToken();
  console.log("Authenticated.\n");

  console.log(`Resolving test folder "${config.mail.testFolderName}"...`);
  const folderId = await getMailFolderId(token, config.mail.testFolderName);

  console.log("Fetching messages...\n");
  return getMessages(token, folderId);
}

async function main() {
  const messages = await getMessagesForRun();

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
      console.log(`Classification: FAILED (malformed model output, skipping)`);
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
  }
  console.log("──────────────────────────────────────");
  console.log(`\n${messages.length} message(s) processed.`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message ?? err);
  process.exit(1);
});
