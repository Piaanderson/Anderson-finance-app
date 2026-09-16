import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db";
import { OwnerSetup } from "@/features/auth/owner-setup";

export const metadata: Metadata = { title: "Set up owner" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const hasUser = (await prisma.user.count()) > 0;
  const bootstrapConfigured = Boolean(process.env.PASSKEY_BOOTSTRAP_TOKEN);

  return (
    <main className="auth-page">
      <section className="card auth-card" aria-labelledby="setup-title">
        <span className="eyebrow">Currents</span>
        <h1 id="setup-title">Set up the owner account</h1>
        {hasUser ? (
          <>
            <p role="status">
              Currents already has an owner. Public setup is closed.
            </p>
            <Link className="button" href="/sign-in">
              Go to sign in
            </Link>
          </>
        ) : bootstrapConfigured ? (
          <OwnerSetup />
        ) : (
          <>
            <p className="warning" role="alert">
              Owner setup is locked until a one-time setup code is configured.
            </p>
            <p className="muted">
              Add <code>PASSKEY_BOOTSTRAP_TOKEN</code> to the Railway web
              service, then reload this page.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
