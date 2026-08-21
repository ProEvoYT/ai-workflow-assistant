import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EmailSummary } from "./graph.js";
import type { ClassificationResult } from "./classify.js";
import { getOrCreateFolderPath, moveMessage, getAttachmentContent, uploadFileToDrive } from "./graph.js";

const MOCK_OUTPUT_DIR = "mock-output";

export interface ActionOutcome {
  movedTo: string;
  attachmentsSaved: string[];
}

/**
 * Executes the workflow decision: move the email, save its attachments
 * to the resolved destination.
 *
 * `token: null` means mock mode -- writes real files to a local folder
 * instead of calling Graph, so the filing logic is provably correct
 * without needing a working Microsoft account. Swapping to real mode
 * later is passing a real token; nothing else about how this is called
 * changes (see index.ts).
 */
export async function executeActions(
  email: EmailSummary,
  result: ClassificationResult,
  token: string | null
): Promise<ActionOutcome> {
  return token === null
    ? executeMockActions(email, result)
    : executeGraphActions(email, result, token);
}

async function executeMockActions(email: EmailSummary, result: ClassificationResult): Promise<ActionOutcome> {
  const destDir = path.join(MOCK_OUTPUT_DIR, result.destination);
  await mkdir(destDir, { recursive: true });

  // Represents "the email got moved/filed" -- a record of it in the
  // destination, since a mock email has no real mailbox to move within.
  const recordPath = path.join(destDir, `${email.id}-email.json`);
  await writeFile(
    recordPath,
    JSON.stringify(
      {
        subject: email.subject,
        from: email.from,
        receivedDateTime: email.receivedDateTime,
        bodyPreview: email.bodyPreview,
        classification: result,
      },
      null,
      2
    )
  );

  const attachmentsSaved: string[] = [];
  for (const attachment of email.attachments) {
    const attPath = path.join(destDir, attachment.name);
    // Mock data has no real file bytes -- write a clearly-labelled
    // placeholder so the *filing mechanic* is proven without pretending
    // to have real document content.
    await writeFile(
      attPath,
      `[MOCK] Placeholder for "${attachment.name}" (${attachment.contentType}, ${attachment.size} bytes in real data).\n`
    );
    attachmentsSaved.push(attPath);
  }

  return { movedTo: destDir, attachmentsSaved };
}

async function executeGraphActions(
  email: EmailSummary,
  result: ClassificationResult,
  token: string
): Promise<ActionOutcome> {
  const folderId = await getOrCreateFolderPath(token, result.destination);
  await moveMessage(token, email.id, folderId);

  const attachmentsSaved: string[] = [];
  for (const attachment of email.attachments) {
    const contentBase64 = await getAttachmentContent(token, email.id, attachment.id);
    await uploadFileToDrive(token, result.destination, attachment.name, contentBase64);
    attachmentsSaved.push(`${result.destination}/${attachment.name}`);
  }

  return { movedTo: result.destination, attachmentsSaved };
}