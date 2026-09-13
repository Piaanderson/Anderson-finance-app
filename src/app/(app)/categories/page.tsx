import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { CategoryForm } from "@/features/categories/category-form";
import { prisma } from "@/server/db";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Categories" };

const sections = ["Needs", "Flex", "Savings", "Debt"];

export default async function CategoriesPage() {
  const owner = await requireHousehold();
  const categories = await prisma.category.findMany({
    where: { householdId: owner.householdId, archivedAt: null },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
  });

  return (
    <>
      <PageHeader title="Categories" />
      <div className="page-content">
        <CategoryForm />
        <div className="stat-grid">
          {sections.map((section) => {
            const rows = categories.filter(
              (category) => category.section === section
            );
            return (
              <section className="card" key={section}>
                <div className="section-heading">
                  <h2>{section}</h2>
                  <span className="muted">{rows.length}</span>
                </div>
                {rows.length ? (
                  <ul>
                    {rows.map((category) => (
                      <li key={category.id}>{category.name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">No categories in this section.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
