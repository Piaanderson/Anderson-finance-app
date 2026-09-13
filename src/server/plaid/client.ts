import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products
} from "plaid";

export { CountryCode, Products };

function plaidHost() {
  const environment = process.env.PLAID_ENV ?? "sandbox";
  if (environment === "production") return PlaidEnvironments.production;
  return PlaidEnvironments.sandbox;
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
