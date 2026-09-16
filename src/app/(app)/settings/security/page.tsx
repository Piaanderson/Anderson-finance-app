import { PageHeader } from "@/components/shell/page-header";
import { PasskeyManager } from "@/features/auth/passkey-manager";
import { requireHousehold } from "@/server/households";
import { prisma } from "@/server/db";

export default async function SecurityPage() {
  const owner = await requireHousehold();
  if (owner.role !== "OWNER") {
    return (
      <>
        <PageHeader title="Security" kicker="Account settings" />
        <div className="page-content">
          <p className="warning" role="alert">
            Only the household owner can manage authentication methods.
          </p>
        </div>
      </>
    );
  }

  const [credentials, unusedRecoveryCodeCount] = await Promise.all([
    prisma.passkeyCredential.findMany({
      where: { userId: owner.userId, revokedAt: null },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.recoveryCode.count({
      where: { userId: owner.userId, usedAt: null }
    })
  ]);

  return (
    <>
      <PageHeader title="Security" kicker="Account settings" />
      <div className="page-content">
        <PasskeyManager
          credentials={credentials.map((credential) => ({
            ...credential,
            createdAt: credential.createdAt.toISOString(),
            lastUsedAt: credential.lastUsedAt?.toISOString() ?? null
          }))}
          unusedRecoveryCodeCount={unusedRecoveryCodeCount}
        />
      </div>
    </>
  );
}
