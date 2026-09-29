import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products
} from "plaid";

export { CountryCode, Products };

export type PlaidRuntimeEnv = "sandbox" | "development" | "production";

export function resolvePlaidEnvironment(
  value = process.env.PLAID_ENV
): PlaidRuntimeEnv {
  const environment = value ?? "sandbox";
  if (
    environment === "sandbox" ||
    environment === "development" ||
    environment === "production"
  ) {
    return environment;
  }
  throw new Error("PLAID_ENV must be sandbox, development, or production.");
}

function plaidHost() {
  return PlaidEnvironments[resolvePlaidEnvironment()];
}

const configuration = new Configuration({
  basePath: plaidHost(),
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
      "PLAID-SECRET": process.env.PLAID_SECRET ?? ""
    }
  }
});

export const plaid = new PlaidApi(configuration);

export function assertPlaidConfigured() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error("Plaid credentials are not configured.");
  }
}
