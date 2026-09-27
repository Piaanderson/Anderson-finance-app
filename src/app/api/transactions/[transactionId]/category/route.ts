import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  merchantRuleKey,
  normalizeMerchantRuleKey
} from "@/features/categories/merchant-rule";
import { isCategorySection } from "@/features/categories/category-domain";
import { prisma } from "@/server/db";
import { requireApiHousehold } from "@/server/households";

const categoryRequest = z.object({
  categoryId: z.string().min(1),
  createRule: z.boolean().default(false),
  merchantKey: z.string().max(120).optional(),
  expectedTransactionRevision: z.string().datetime({ offset: true }),
  expectedRuleRevision: z.string().datetime({ offset: true }).nullable()
});

class CategoryAssignmentError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly code: string
  ) {
    super(message);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const owner = await requireApiHousehold();
  if (!owner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = categoryRequest.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  const { transactionId } = await params;

  try {
    let result: { savedRuleKey: string | null } | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const [transaction, category] = await Promise.all([
              tx.transaction.findFirst({
                where: {
                  id: transactionId,
                  householdId: owner.householdId,
                  removedAt: null,
                  account: { householdId: owner.householdId }
                },
                select: {
                  id: true,
                  name: true,
                  merchantName: true,
                  updatedAt: true
                }
              }),
              tx.category.findFirst({
                where: {
                  id: parsed.data.categoryId,
                  householdId: owner.householdId,
                  archivedAt: null
                },
                select: { id: true, section: true }
              })
            ]);
            if (
              !transaction ||
              !category ||
              !isCategorySection(category.section)
            ) {
              throw new CategoryAssignmentError("Not found", 404, "NOT_FOUND");
            }
            if (
              transaction.updatedAt.toISOString() !==
              parsed.data.expectedTransactionRevision
            ) {
              throw new CategoryAssignmentError(
                "This transaction changed in another session. Reload before assigning it.",
                409,
                "CATEGORY_ASSIGNMENT_CONFLICT"
              );
            }
            const defaultRuleKey = merchantRuleKey(transaction);
            const existingRule = defaultRuleKey
              ? await tx.merchantRule.findUnique({
                  where: {
                    householdId_merchantKey: {
                      householdId: owner.householdId,
                      merchantKey: defaultRuleKey
                    }
                  },
                  select: { id: true, updatedAt: true }
                })
              : null;
            const expectedRuleRevision = parsed.data.expectedRuleRevision;
            if (
              (existingRule &&
                existingRule.updatedAt.toISOString() !==
                  expectedRuleRevision) ||
              (!existingRule && expectedRuleRevision !== null)
            ) {
              throw new CategoryAssignmentError(
                "The merchant rule changed in another session. Reload before assigning this transaction.",
                409,
                "MERCHANT_RULE_STALE"
              );
            }

            let savedRuleKey = defaultRuleKey;
            if (parsed.data.createRule) {
              savedRuleKey = normalizeMerchantRuleKey(
                parsed.data.merchantKey ?? ""
              );
              if (!savedRuleKey) {
                throw new CategoryAssignmentError(
                  "Enter an exact merchant key or assign this transaction without a rule.",
                  422,
                  "MERCHANT_KEY_MISSING"
                );
              }
              const conflictingRule = await tx.merchantRule.findUnique({
                where: {
                  householdId_merchantKey: {
                    householdId: owner.householdId,
                    merchantKey: savedRuleKey
                  }
                },
                select: { id: true }
              });
              if (conflictingRule && conflictingRule.id !== existingRule?.id) {
                throw new CategoryAssignmentError(
                  "Another merchant rule already uses that exact normalized key. Edit it on Categories instead of replacing it silently.",
                  409,
                  "MERCHANT_RULE_CONFLICT"
                );
              }
              if (existingRule) {
                const updatedRule = await tx.merchantRule.updateMany({
                  where: {
                    id: existingRule.id,
                    householdId: owner.householdId,
                    updatedAt: existingRule.updatedAt
                  },
                  data: {
                    merchantKey: savedRuleKey,
                    categoryId: category.id
                  }
                });
                if (updatedRule.count !== 1) {
                  throw new CategoryAssignmentError(
                    "The merchant rule changed in another session. Reload before assigning this transaction.",
                    409,
                    "MERCHANT_RULE_STALE"
                  );
                }
              } else {
                await tx.merchantRule.create({
                  data: {
                    householdId: owner.householdId,
                    categoryId: category.id,
                    merchantKey: savedRuleKey
                  }
                });
              }
            } else if (existingRule) {
              const deletedRule = await tx.merchantRule.deleteMany({
                where: {
                  id: existingRule.id,
                  householdId: owner.householdId,
                  updatedAt: existingRule.updatedAt
                }
              });
              if (deletedRule.count !== 1) {
                throw new CategoryAssignmentError(
                  "The merchant rule changed in another session. Reload before assigning this transaction.",
                  409,
                  "MERCHANT_RULE_STALE"
                );
              }
            }

            const updatedTransaction = await tx.transaction.updateMany({
              where: {
                id: transaction.id,
                householdId: owner.householdId,
                removedAt: null,
                updatedAt: transaction.updatedAt
              },
              data: { categoryId: category.id }
            });
            if (updatedTransaction.count !== 1) {
              throw new CategoryAssignmentError(
                "This transaction changed in another session. Reload before assigning it.",
                409,
                "CATEGORY_ASSIGNMENT_CONFLICT"
              );
            }
            return { savedRuleKey };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!result) {
      throw new CategoryAssignmentError(
        "The category or merchant rule changed in another session. Reload before trying again.",
        409,
        "CATEGORY_ASSIGNMENT_CONFLICT"
      );
    }
    return NextResponse.json({
      categorized: true,
      rule: {
        active: parsed.data.createRule,
        merchantKey: result.savedRuleKey
      }
    });
  } catch (error) {
    if (error instanceof CategoryAssignmentError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        {
          error:
            "The category or merchant rule changed in another session. Reload before trying again.",
          code: "CATEGORY_ASSIGNMENT_CONFLICT"
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        error:
          "The category assignment could not be saved. Check your connection and try again.",
        code: "CATEGORY_ASSIGNMENT_FAILED"
      },
      { status: 500 }
    );
  }
}
