import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { getHouseholdCategoryMaintenanceData } from "@/features/categories/category-data";
import { CategoryMaintenanceWorkspace } from "@/features/categories/category-maintenance-workspace";
import { requireHousehold } from "@/server/households";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const owner = await requireHousehold();
  const maintenance = await getHouseholdCategoryMaintenanceData(
    owner.householdId
  );

  return (
    <>
      <PageHeader title="Categories" />
      <div className="page-content">
        <CategoryMaintenanceWorkspace {...maintenance} />
      </div>
    </>
  );
}
