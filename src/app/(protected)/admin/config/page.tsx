import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getBusinessConfig } from "@/actions/business-config";
import { ConfigTabs } from "./ConfigTabs";

export default async function AdminConfigPage() {
  const session = await auth();
  if (!session || session.user.role !== UserRole.ADMIN) redirect("/");

  const result = await getBusinessConfig();
  if (result.error || !result.success) {
    return <p className="text-destructive p-6">{result.error}</p>;
  }

  return <ConfigTabs initialData={result.success} />;
}
