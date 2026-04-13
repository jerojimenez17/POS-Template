"use client";
import MenuCard from "./MenuCard";
import { useSession } from "next-auth/react";
import { LayoutGrid, FileText, Search, Package, BookOpen, Calculator, BarChart3, Users } from "lucide-react";

const RootMenu = () => {
  const { data: session } = useSession();
  const businessSlug = session?.user?.businessSlug;
  const role = session?.user?.role;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-full max-w-6xl px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <MenuCard url="/newBill" title="Facturar">
            <FileText className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>
          
          <MenuCard url="/searchBill" title="Consultar">
            <Search className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>
          
          <MenuCard url="/stock/productDashboard" title="Stock">
            <Package className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>
          
          <MenuCard url="/account-ledger" title="Fichero">
            <BookOpen className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>
          
          <MenuCard url="/cashRegister" title="Caja">
            <Calculator className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>
          
          <MenuCard url="/report" title="Reportes">
            <BarChart3 className="w-16 h-16" strokeWidth={1.5} />
          </MenuCard>

          {businessSlug && (
            <MenuCard url={`/${businessSlug}/catalogo`} title="Catálogo">
              <LayoutGrid className="w-16 h-16" strokeWidth={1.5} />
            </MenuCard>
          ) || (
            // Fallback if businessSlug is not loaded yet or unavailable
             <MenuCard url="#" title="Catálogo">
              <LayoutGrid className="w-16 h-16 opacity-50" strokeWidth={1.5} />
            </MenuCard>
          )}
          
          {role === 'ADMIN' && (
            <MenuCard url="/admin/users" title="Usuarios">
              <Users className="w-16 h-16" strokeWidth={1.5} />
            </MenuCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default RootMenu;
