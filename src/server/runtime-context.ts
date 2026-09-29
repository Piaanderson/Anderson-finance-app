export type DeployContext = "local" | "ci" | "staging" | "production";

const RAILWAY_HOST_MARKERS = ["railway.internal", "rlwy.net", "up.railway.app"];

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

function railwayEnvironmentName(env: Env) {
  return env.RAILWAY_ENVIRONMENT_NAME ?? env.RAILWAY_ENVIRONMENT ?? "";
}

export function resolveDeployContext(env: Env = process.env): DeployContext {
  const railwayName = railwayEnvironmentName(env);
  if (railwayName === "production") return "production";
  if (railwayName === "staging") return "staging";
  if (env.CI === "true" || env.GITLAB_CI === "true" || env.GITHUB_ACTIONS) {
    return "ci";
  }
  return "local";
}

function databaseLooksLikeRailway(databaseUrl: string) {
  return RAILWAY_HOST_MARKERS.some((marker) => databaseUrl.includes(marker));
}

function usesPrivateRailwayDatabase(databaseUrl: string) {
  return databaseUrl.includes("postgres.railway.internal");
}

export function assertIsolatedRuntime(env: Env = process.env) {
  const context = resolveDeployContext(env);
  const databaseUrl = env.DATABASE_URL ?? "";
  const plaidEnv = env.PLAID_ENV ?? "sandbox";

  if (
    env.AUTH_DEV_BYPASS === "true" &&
    (context === "production" || context === "staging")
  ) {
    throw new Error(
      "AUTH_DEV_BYPASS cannot be enabled in staging or production."
    );
  }

  if (context === "ci") {
    if (env.PLAID_CLIENT_ID || env.PLAID_SECRET) {
      throw new Error("CI must not define live Plaid credentials.");
    }
    if (databaseLooksLikeRailway(databaseUrl)) {
      throw new Error("CI must not use a Railway database URL.");
    }
  }

  if (context === "staging" && plaidEnv === "production") {
    throw new Error("Staging cannot use Plaid Production credentials.");
  }

  if (
    (context === "production" || context === "staging") &&
    usesPrivateRailwayDatabase(databaseUrl) === false
  ) {
    throw new Error(
      "Staging and production must use the private Railway PostgreSQL host."
    );
  }

  if (context === "local" && databaseLooksLikeRailway(databaseUrl)) {
    throw new Error("Local development must not use a Railway database URL.");
  }
}

export async function assertProductionBootstrapState(
  env: Env = process.env,
  userCount: () => Promise<number> = async () => 0
) {
  if (resolveDeployContext(env) !== "production") return;
  if (!env.PASSKEY_BOOTSTRAP_TOKEN) return;
  const owners = await userCount();
  if (owners > 0) {
    throw new Error(
      "PASSKEY_BOOTSTRAP_TOKEN must be removed from production after owner setup."
    );
  }
}
