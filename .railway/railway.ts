import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  service,
  volume
} from "railway/iac";

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");
  const AndersonFinanceApp = github("Piaanderson/Anderson-finance-app", {
    checkSuites: false
  });

  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "sfo",
    sizeMB: 500
  });
  const PostgresPITR = production
    ? bucket("Postgres-PITR", { region: "sjc" })
    : null;
  const web = service("web", {
    source: AndersonFinanceApp,
    build: "npm run build",
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    preDeploy: "npm run db:deploy",
    replicas: { sfo: 1 },
    deploy: { restartPolicyMaxRetries: 3 },
    env: {
      AUTH_SECRET: preserve(),
      AUTH_TRUST_HOST: preserve(),
      AUTH_URL: preserve(),
      DATABASE_URL: Postgres.env.DATABASE_URL,
      NEXT_TELEMETRY_DISABLED: preserve(),
      PASSKEY_ORIGIN: production
        ? "https://web-production-5ec4a.up.railway.app"
        : preserve(),
      PASSKEY_RP_ID: production
        ? "web-production-5ec4a.up.railway.app"
        : preserve(),
      PASSKEY_RP_NAME: "Currents",
      PLAID_CLIENT_ID: preserve(),
      PLAID_ENV: preserve(),
      PLAID_SECRET: preserve(),
      PLAID_WEBHOOK_URL: preserve(),
      TOKEN_ENCRYPTION_KEY: preserve(),
      TOKEN_ENCRYPTION_KEY_VERSION: preserve()
    }
  });
  const syncCron = service("sync-cron", {
    source: AndersonFinanceApp,
    build: "npm run db:generate",
    start: "npm run cron:sync",
    replicas: { sfo: 1 },
    deploy: { cronSchedule: "17 */6 * * *", restartPolicyType: "NEVER" },
    env: { DATABASE_URL: Postgres.env.DATABASE_URL }
  });
  const worker = service("worker", {
    source: AndersonFinanceApp,
    build: "npm run db:generate",
    start: "npm run worker",
    preDeploy: "npm run db:deploy",
    replicas: { sfo: 1 },
    env: {
      DATABASE_URL: Postgres.env.DATABASE_URL,
      LOG_LEVEL: preserve(),
      PLAID_CLIENT_ID: preserve(),
      PLAID_ENV: preserve(),
      PLAID_SECRET: preserve(),
      PLAID_WEBHOOK_URL: preserve(),
      SYNC_POLL_MS: preserve(),
      TOKEN_ENCRYPTION_KEY: preserve(),
      TOKEN_ENCRYPTION_KEY_VERSION: preserve()
    }
  });

  return project("Currents", {
    resources: [
      web,
      Postgres,
      syncCron,
      worker,
      postgresVolume,
      ...(PostgresPITR ? [PostgresPITR] : [])
    ]
  });
});
