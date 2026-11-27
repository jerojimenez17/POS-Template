"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useMobileNav } from "@/context/MobileNavContext";
import {
  FileText,
  Package,
  BookOpen,
  Calculator,
  BarChart3,
  LayoutGrid,
  Users,
  Contact,
  Box,
  Settings,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

type ResolvedNavItem = NavItem & {
  resolvedHref?: string;
  disabled: boolean;
};

const navGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { label: "Facturar", href: "/newBill", icon: <FileText className="h-5 w-5" /> },
      { label: "Stock", href: "/stock/productDashboard", icon: <Package className="h-5 w-5" /> },
      { label: "Fichero", href: "/account-ledger", icon: <BookOpen className="h-5 w-5" /> },
      { label: "Clientes", href: "/clients", icon: <Contact className="h-5 w-5" /> },
      { label: "Caja", href: "/cashRegister", icon: <Calculator className="h-5 w-5" /> },
      { label: "Reportes", href: "/report", icon: <BarChart3 className="h-5 w-5" /> },
      { label: "Catálogo", icon: <LayoutGrid className="h-5 w-5" /> },
    ],
  },
  {
    label: "Administración",
    adminOnly: true,
    items: [
      { label: "Usuarios", href: "/admin/users", icon: <Users className="h-5 w-5" /> },
      { label: "Cajas", href: "/admin/cashboxes", icon: <Box className="h-5 w-5" /> },
    ],
  },
  {
    label: "Configuración",
    adminOnly: true,
    items: [
      { label: "Config.", href: "/admin/settings", icon: <Settings className="h-5 w-5" /> },
    ],
  },
];

const SideNav = () => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const businessSlug = session?.user?.businessSlug;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();

  const isActive = (href: string) => {
    return pathname.startsWith(href);
  };

  const resolvedGroups = navGroups
    .filter((group) => !group.adminOnly || isAdmin)
    .map((group) => ({
      ...group,
      items: group.items.map((item) => ({
        ...item,
        resolvedHref: item.label === "Catálogo" && businessSlug ? `/${businessSlug}/catalogo` : item.href,
        disabled: item.label === "Catálogo" && !businessSlug,
      })) as ResolvedNavItem[],
    }));

  const NavLink = ({ item, active, onClick }: { item: ResolvedNavItem; active: boolean; onClick?: () => void }) => item.disabled ? (
    <div
      aria-busy="true"
      aria-disabled="true"
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap overflow-hidden",
        "text-gray-400 dark:text-gray-600 cursor-wait"
      )}
      title="Catálogo (cargando)"
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
        {item.label} (cargando)
      </span>
    </div>
  ) : (
    <Link
      key={item.label}
      href={item.resolvedHref!}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap overflow-hidden",
        active
          ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
          : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
      )}
      title={item.label}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
        {item.label}
      </span>
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40 hidden md:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-200 w-14 hover:w-48 group/sidebar">
        <div className="flex flex-col gap-1 p-2 pt-4 overflow-hidden">
          {resolvedGroups.map((group, groupIndex) => (
            <div key={group.label} className="flex flex-col gap-1">
              {groupIndex > 0 && (
                <div className="my-2 h-px bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap pl-3 pr-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                {group.label}
              </span>
              {group.items.map((item) => (
                <NavLink
                  key={item.label}
                  item={item}
                  active={item.resolvedHref ? isActive(item.resolvedHref) : false}
                />
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 shadow-2xl transform transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-gray-800 dark:text-gray-200">Navegación</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-1 p-3">
          {resolvedGroups.map((group, groupIndex) => (
            <div key={group.label} className="flex flex-col gap-1">
              {groupIndex > 0 && (
                <div className="my-2 h-px bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
              )}
              <span className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.label}
              </span>
              {group.items.map((item) => item.disabled ? (
                <div
                  key={item.label}
                  aria-busy="true"
                  aria-disabled="true"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 dark:text-gray-600 cursor-wait"
                  title="Catálogo (cargando)"
                >
                  {item.icon}
                  {item.label} (cargando)
                </div>
              ) : (
                <Link
                  key={item.label}
                  href={item.resolvedHref!}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    (item.resolvedHref ? isActive(item.resolvedHref) : false)
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default SideNav;
