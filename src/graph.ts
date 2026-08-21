const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyPreview: string;
  hasAttachments: boolean;
  attachments: { id: string; name: string; contentType: string; size: number }[];
}

async function graphGet(path: string, token: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function graphSend(path: string, token: string, method: "POST" | "PUT", body: BodyInit, contentType: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body,
  });
  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`Graph ${method} ${path} failed: ${res.status} ${responseBody}`);
  }
  return res.status === 204 ? null : res.json();
}

/**
 * Resolves a mail folder's ID from its display name.
 * Looks only at top-level folders under the mailbox root -- fine for a
 * dedicated test folder created directly under Inbox or the root.
 */
export async function getMailFolderId(token: string, folderName: string): Promise<string> {
  const data = await graphGet(
    `/me/mailFolders?$filter=displayName eq '${encodeURIComponent(folderName)}'`,
    token
  );
  const folder = data.value?.[0];
  if (!folder) {
    throw new Error(
      `Mail folder "${folderName}" not found. Create it in Outlook first (see README).`
    );
  }
  return folder.id;
}

/**
 * Fetches messages from a given folder, including attachment metadata
 * (names/types/sizes only -- not attachment content, that's a later step).
 */
export async function getMessages(token: string, folderId: string, top = 10): Promise<EmailSummary[]> {
  const data = await graphGet(
    `/me/mailFolders/${folderId}/messages` +
      `?$top=${top}` +
      `&$select=id,subject,from,receivedDateTime,bodyPreview,hasAttachments`,
    token
  );

  const messages: EmailSummary[] = [];

  for (const msg of data.value ?? []) {
    let attachments: EmailSummary["attachments"] = [];

    if (msg.hasAttachments) {
      const attData = await graphGet(
        `/me/messages/${msg.id}/attachments?$select=id,name,contentType,size`,
        token
      );
      attachments = (attData.value ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        contentType: a.contentType,
        size: a.size,
      }));
    }

    messages.push({
      id: msg.id,
      subject: msg.subject ?? "(no subject)",
      from: msg.from?.emailAddress?.address ?? "(unknown sender)",
      receivedDateTime: msg.receivedDateTime,
      bodyPreview: msg.bodyPreview ?? "",
      hasAttachments: msg.hasAttachments,
      attachments,
    });
  }

  return messages;
}

/**
 * MILESTONE 3 additions below. These are real-mode actions -- written
 * and type-checked, but not yet run against a live mailbox since
 * Microsoft account/tenant access is still blocked. Mock mode
 * (see actions.ts) proves the same *logic* (destination resolution,
 * file writing) without depending on these actually working yet.
 * When Microsoft access clears, testing these is the very next step --
 * the rest of the app doesn't need to change to exercise them.
 */

/**
 * Resolves a slash-separated destination (e.g. "Finance/Invoices") to a
 * mail folder ID, creating any missing segments along the way. Nested
 * under the mailbox root via Graph's well-known "msgfolderroot" alias.
 */
export async function getOrCreateFolderPath(token: string, folderPath: string): Promise<string> {
  const segments = folderPath.split("/").filter(Boolean);
  let parentId = "msgfolderroot";

  for (const segment of segments) {
    const existing = await graphGet(
      `/me/mailFolders/${parentId}/childFolders?$filter=displayName eq '${encodeURIComponent(segment)}'`,
      token
    );
    let folder = existing.value?.[0];

    if (!folder) {
      folder = await graphSend(
        `/me/mailFolders/${parentId}/childFolders`,
        token,
        "POST",
        JSON.stringify({ displayName: segment }),
        "application/json"
      );
    }

    parentId = folder.id;
  }

  return parentId;
}

export async function moveMessage(token: string, messageId: string, destinationFolderId: string): Promise<void> {
  await graphSend(
    `/me/messages/${messageId}/move`,
    token,
    "POST",
    JSON.stringify({ destinationId: destinationFolderId }),
    "application/json"
  );
}

/** Fetches an attachment's content as a base64 string. */
export async function getAttachmentContent(token: string, messageId: string, attachmentId: string): Promise<string> {
  const data = await graphGet(`/me/messages/${messageId}/attachments/${attachmentId}`, token);
  return data.contentBytes;
}

/**
 * Uploads a file to the signed-in user's OneDrive at the given folder
 * path, creating folders as needed (Graph does this automatically for
 * this endpoint). MTN's version of this would likely target a
 * SharePoint site/library drive ID instead of "/me/drive" -- that's a
 * one-line change to the base path, not a rewrite.
 */
export async function uploadFileToDrive(
  token: string,
  folderPath: string,
  fileName: string,
  contentBase64: string
): Promise<void> {
  const bytes = Buffer.from(contentBase64, "base64");
  const path = `${folderPath}/${fileName}`.split("/").map(encodeURIComponent).join("/");
  await graphSend(`/me/drive/root:/${path}:/content`, token, "PUT", bytes, "application/octet-stream");
}