import "dotenv/config";

/**
 * Every environment-specific value the app needs lives here, and only
 * here. When this project moves from a personal/school mailbox to MTN's
 * tenant, nothing outside this file (and .env) should need to change for
 * Milestones 1-2's auth, read, and classify behaviour.
 */

const MOCK_MODE = process.env.MOCK_MODE === "true";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy env.example.txt to .env and fill it in.`
    );
  }
  return value;
}

// In mock mode, Microsoft credentials are never used (no auth, no Graph
// calls happen), so we don't force the user to have them just to run a
// local demo.
function requireEnvUnlessMock(name: string): string {
  if (MOCK_MODE) return process.env[name] ?? "";
  return requireEnv(name);
}

export const config = {
  ms: {
    clientId: requireEnvUnlessMock("MS_CLIENT_ID"),
    tenantId: process.env.MS_TENANT_ID ?? "common",
    authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID ?? "common"}`,
  },
  mail: {
    testFolderName: process.env.MAIL_TEST_FOLDER_NAME ?? "AI-Demo",
  },
  graphScopes: (process.env.GRAPH_SCOPES ?? "Mail.ReadWrite Mail.Read User.Read").split(" "),
  classify: {
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    model: process.env.CLASSIFY_MODEL ?? "gemini-3.6-flash",
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7"),
    // Free tier is 5 requests/minute for this model as of testing.
    // Override via env if using a paid tier with a higher limit.
    maxRequestsPerMinute: Number(process.env.CLASSIFY_MAX_PER_MINUTE ?? "5"),
  },
} as const;