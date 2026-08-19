import "dotenv/config";

/**
 * Every environment-specific value the app needs lives here, and only
 * here. When this project moves from a personal/school mailbox to MTN's
 * tenant, nothing outside this file (and .env) should need to change for
 * Milestones 1-2's auth, read, and classify behaviour.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy env.example.txt to .env and fill it in.`
    );
  }
  return value;
}

export const config = {
  ms: {
    clientId: requireEnv("MS_CLIENT_ID"),
    tenantId: process.env.MS_TENANT_ID ?? "common",
    authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID ?? "common"}`,
  },
  mail: {
    testFolderName: process.env.MAIL_TEST_FOLDER_NAME ?? "AI-Demo",
  },
  graphScopes: (process.env.GRAPH_SCOPES ?? "Mail.ReadWrite Mail.Read User.Read").split(" "),
  classify: {
    anthropicApiKey: requireEnv("ANTHROPIC_API_KEY"),
    model: process.env.CLASSIFY_MODEL ?? "claude-sonnet-4-6",
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7"),
  },
} as const;
