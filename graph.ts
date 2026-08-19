const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface EmailSummary {
  id: string;
  subject: string;
  from: string;
  receivedDateTime: string;
  bodyPreview: string;
  hasAttachments: boolean;
  attachments: { name: string; contentType: string; size: number }[];
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
        `/me/messages/${msg.id}/attachments?$select=name,contentType,size`,
        token
      );
      attachments = (attData.value ?? []).map((a: any) => ({
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
