
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (session?.user?.role !== UserRole.SUPER_ADMIN) {
    // If not super admin, redirect to home or login
    // Maybe show 403 or redirect
    return redirect("/");
  }

  return (
    <div className="flex h-screen bg-gray-100">
        {/* Placeholder for Sidebar */}
      <aside className="hidden w-64 flex-col bg-slate-900 text-white md:flex">
         <div className="p-4 text-xl font-bold">Super Admin</div>
         <nav className="flex-1 p-2">
            <Link href="/superadmin/dashboard" className="block rounded p-2 hover:bg-slate-800">Users</Link>
            <Link href="/superadmin/businesses" className="block rounded p-2 hover:bg-slate-800">Businesses</Link>
         </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8 text-black">
        {children}
      </main>
    </div>
  );
}
