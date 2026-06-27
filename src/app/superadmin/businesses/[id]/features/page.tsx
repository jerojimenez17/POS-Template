import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Shield, Calendar, Building, Hash } from "lucide-react";
import { FeaturesForm } from "./FeaturesForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveFeatures } from "@/lib/plan-resolver";

interface FeaturesPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function BusinessFeaturesPage({ params }: FeaturesPageProps) {
  const session = await auth();

  // Validate session and SUPER_ADMIN role
  if (!session || session.user?.role !== UserRole.SUPER_ADMIN) {
    redirect("/auth/login");
  }

  const { id } = await params;

  // Load all active plan definitions for the plan selector
  const planDefinitions = await db.planDefinition.findMany({
    orderBy: { displayOrder: "asc" },
    where: { isActive: true },
  });

  // Eager-load the target business features from the database
  const business = await db.business.findUnique({
    where: { id },
    include: {
      features: { include: { planDefinition: true } },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // If business is not found, redirect to `/superadmin/businesses`
  if (!business) {
    redirect("/superadmin/businesses");
  }

  // Resolve initial features: if BusinessFeatures exists with PlanDefinition, merge defaults + overrides
  type InitialBusinessFeatures = {
    id?: string;
    businessId: string;
    planDefinitionId: string;
    plan: string;
    overrides: any;
    hasAfipBilling: boolean;
    hasPublicCatalog: boolean;
    hasClientLedger: boolean;
    hasMultiCashbox: boolean;
    hasSupplierFilter: boolean;
    hasBudget: boolean;
    maxUsers: number;
    maxProducts: number;
    maxCashboxes: number;
    maxClients: number;
    dailySalesLimit: number;
  };

  let businessFeatures: InitialBusinessFeatures;

  if (business.features?.planDefinition) {
    const resolved = resolveFeatures(
      {
        features: business.features.planDefinition.features as Record<string, any>,
        limits: business.features.planDefinition.limits as Record<string, any>,
      },
      business.features.overrides as Record<string, any> | null,
    );

    businessFeatures = {
      id: business.features.id,
      businessId: business.id,
      planDefinitionId: business.features.planDefinitionId,
      plan: business.features.planDefinition.name,
      overrides: business.features.overrides,
      hasAfipBilling: resolved.hasAfipBilling,
      hasPublicCatalog: resolved.hasPublicCatalog,
      hasClientLedger: resolved.hasClientLedger,
      hasMultiCashbox: resolved.hasMultiCashbox,
      hasSupplierFilter: resolved.hasSupplierFilter,
      hasBudget: resolved.hasBudget,
      maxUsers: resolved.maxUsers,
      maxProducts: resolved.maxProducts,
      maxCashboxes: resolved.maxCashboxes,
      maxClients: resolved.maxClients,
      dailySalesLimit: resolved.dailySalesLimit,
    };
  } else {
    businessFeatures = {
      id: "",
      businessId: business.id,
      planDefinitionId: planDefinitions.find((p) => p.name === "BASIC")?.id ?? "",
      plan: "BASIC",
      overrides: null,
      hasAfipBilling: false,
      hasPublicCatalog: false,
      hasClientLedger: false,
      hasMultiCashbox: false,
      hasSupplierFilter: false,
      hasBudget: false,
      maxUsers: 1,
      maxProducts: 100,
      maxCashboxes: 1,
      maxClients: 50,
      dailySalesLimit: 999999,
    };
  }

  const owner = business.users.find((u) => u.id === business.userId) || business.users[0];

  return (
    <div className="container mx-auto space-y-8 p-6 max-w-7xl animate-fade-in">
      {/* High-Fidelity Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500 font-medium">
        <Link
          href="/superadmin/dashboard"
          className="hover:text-primary transition-colors duration-200"
        >
          Superadmin
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <Link
          href="/superadmin/businesses"
          className="hover:text-primary transition-colors duration-200"
        >
          Businesses
        </Link>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-gray-900 font-semibold">{business.name}</span>
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span className="text-primary font-semibold">Features & Plans</span>
      </nav>

      {/* High-Fidelity Header Card */}
      <Card className="border-none shadow-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:20px_20px]" />
        <div className="absolute right-0 top-0 -mt-12 -mr-12 w-72 h-72 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 -mb-16 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl" />
        
        <CardHeader className="relative z-10 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5" />
                Superadmin Dashboard
              </div>
              <CardTitle className="text-3xl md:text-4xl font-extrabold tracking-tight mt-2 bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                {business.name}
              </CardTitle>
              <CardDescription className="text-slate-400 text-base max-w-2xl">
                Configure plan settings, operational limits, and premium feature flag overrides for this organization.
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-3 self-start md:self-center">
              <Button
                asChild
                variant="outline"
                className="bg-transparent border-slate-700 hover:bg-slate-800 hover:text-white text-slate-300 transition-all duration-200"
              >
                <Link href="/superadmin/businesses">
                  Volver a Negocios
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Clean Outline Metadata Section */}
        <CardContent className="relative z-10 border-t border-slate-800 bg-slate-950/40 p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50 text-slate-300">
                <Building className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Business Slug</span>
                <span className="text-sm font-semibold text-slate-200 font-mono bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700/30 w-fit">
                  {business.slug}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50 text-slate-300">
                <Hash className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Business ID</span>
                <span className="text-xs font-semibold text-slate-300 font-mono truncate max-w-[160px]" title={business.id}>
                  {business.id}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50 text-slate-300">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Owner Contact</span>
                <span className="text-sm font-semibold text-slate-200 truncate max-w-[200px]" title={owner?.email || "N/A"}>
                  {owner?.name || owner?.email || "Sin dueño"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700/50 text-slate-300">
                <Calendar className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Created At</span>
                <span className="text-sm font-semibold text-slate-200">
                  {business.createdAt.toLocaleDateString("es-AR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Form Component */}
      <FeaturesForm
        businessId={business.id}
        businessName={business.name}
        initialFeatures={businessFeatures}
        planDefinitions={planDefinitions}
      />
    </div>
  );
}
