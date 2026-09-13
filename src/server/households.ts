import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/db";

export async function requireHousehold() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id },
    include: { household: true },
    orderBy: { createdAt: "asc" }
  });

  if (!membership) {
    throw new Error("Authenticated user has no household membership.");
  }

  return {
    userId: session.user.id,
    householdId: membership.householdId,
    household: membership.household,
    role: membership.role
  };
}

export async function requireApiHousehold() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await prisma.householdMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" }
  });

  if (!membership) return null;
  return {
    userId: session.user.id,
    householdId: membership.householdId,
    role: membership.role
  };
}
