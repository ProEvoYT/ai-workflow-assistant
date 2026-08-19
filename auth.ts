import { PublicClientApplication } from "@azure/msal-node";
import { config } from "./config.js";

/**
 * Delegated, self-scoped auth: device code flow, no client secret.
 * You sign in as yourself, in a browser, once per token lifetime.
 *
 * The difference between this and an MTN deployment isn't the auth
 * *mechanism* -- it's whether the tenant is "common"/personal vs. MTN's
 * tenant ID, and whether extra scopes need admin consent. Both of those
 * are config.ts changes, not code changes.
 */

const pca = new PublicClientApplication({
  auth: {
    clientId: config.ms.clientId,
    authority: config.ms.authority,
  },
});

let cachedToken: { value: string; expiresOn: number } | null = null;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresOn > now + 60_000) {
    return cachedToken.value;
  }

  const result = await pca.acquireTokenByDeviceCode({
    scopes: config.graphScopes,
    deviceCodeCallback: (response) => {
      console.log("\n--- Microsoft sign-in required ---");
      console.log(response.message);
      console.log("-----------------------------------\n");
    },
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire access token.");
  }

  cachedToken = {
    value: result.accessToken,
    expiresOn: result.expiresOn?.getTime() ?? now + 55 * 60_000,
  };

  return cachedToken.value;
}
