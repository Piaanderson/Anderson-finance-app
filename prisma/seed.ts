import { prisma } from "../src/server/db";
import type { CategorySection } from "../src/features/categories/category-domain";

const groups: Record<CategorySection, readonly string[]> = {
  Needs: [
    "Mortgage",
    "Electric",
    "Gas",
    "Water",
    "Internet",
    "Insurance",
    "Phones"
  ],
  Flex: ["Groceries", "Dining", "Fuel", "Household", "Fun", "Kids", "Gifts"],
  Savings: ["Vacation", "Christmas", "HOA + birthdays", "Weekend trips"],
  Debt: [
    "Chase card",
    "Capital One card",
    "Citi · everyday",
    "Citi · travel",
    "BofA camper loan",
    "WF line of credit"
  ]
};

const planned: Record<string, number> = {
  Mortgage: 2180,
  Electric: 145,
  Gas: 62,
  Water: 103,
  Internet: 85,
  Insurance: 265,
  Phones: 120,
  Groceries: 720,
  Dining: 260,
  Fuel: 180,
  Household: 120,
  Fun: 140,
  Kids: 95,
  Gifts: 60,
  Vacation: 300,
  Christmas: 150,
  "HOA + birthdays": 175,
  "Weekend trips": 100,
  "Chase card": 400,
  "Capital One card": 250,
  "Citi · everyday": 120,
  "Citi · travel": 180,
  "BofA camper loan": 465,
  "WF line of credit": 300
};

async function seed() {
  const user = await prisma.user.upsert({
    where: { email: "owner@currents.local" },
    update: {},
    create: { email: "owner@currents.local", name: "Local user" }
  });
  let membership = await prisma.householdMember.findFirst({
    where: { userId: user.id }
  });
  if (!membership) {
    const household = await prisma.household.create({
      data: {
        name: "My household",
        members: { create: { userId: user.id, role: "OWNER" } }
      }
    });
    membership = await prisma.householdMember.findFirstOrThrow({
      where: { householdId: household.id, userId: user.id }
    });
  }

  for (const [section, names] of Object.entries(groups)) {
    for (const [sortOrder, name] of names.entries()) {
      await prisma.category.upsert({
        where: {
          householdId_name: { householdId: membership.householdId, name }
        },
        update: { section, sortOrder },
        create: {
          householdId: membership.householdId,
          name,
          section,
          sortOrder
        }
      });
    }
  }

  const budget = await prisma.budgetMonth.upsert({
    where: {
      householdId_month: {
        householdId: membership.householdId,
        month: new Date("2026-09-01T00:00:00.000Z")
      }
    },
    update: { income: 8240 },
    create: {
      householdId: membership.householdId,
      month: new Date("2026-09-01T00:00:00.000Z"),
      income: 8240
    }
  });
  const categories = await prisma.category.findMany({
    where: { householdId: membership.householdId }
  });
  for (const category of categories) {
    await prisma.budgetAllocation.upsert({
      where: {
        budgetMonthId_categoryId: {
          budgetMonthId: budget.id,
          categoryId: category.id
        }
      },
      update: { planned: planned[category.name] ?? 0 },
      create: {
        budgetMonthId: budget.id,
        categoryId: category.id,
        planned: planned[category.name] ?? 0
      }
    });
  }
}

seed()
  .then(() => console.info("Seeded Currents demo household."))
  .finally(() => prisma.$disconnect());
