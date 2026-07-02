"use client";

import { useState, useTransition, useEffect } from "react";
import { updateBusinessFeaturesAction } from "@/actions/superadmin";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Users,
  Package,
  Layers,
  ArrowRight,
  TrendingUp,
  FileText,
  Globe,
  Wallet,
  Settings2,
  RefreshCw,
  Info,
  MinusCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FeaturesFormProps {
  businessId: string;
  businessName: string;
  planDefinitions: Array<{
    id: string;
    name: string;
    features: any;
    limits: any;
    description: string | null;
    displayOrder: number;
  }>;
  initialFeatures: {
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
    hasNegativeStock: boolean;
    maxUsers: number;
    maxProducts: number;
  };
}

interface PlanPreset {
  planName: string;
  name: string;
  badge: string;
  price: string;
  desc: string;
  hasAfipBilling: boolean;
  hasPublicCatalog: boolean;
  hasClientLedger: boolean;
  hasMultiCashbox: boolean;
  hasSupplierFilter: boolean;
  hasBudget: boolean;
  hasNegativeStock: boolean;
  maxUsers: number;
  maxProducts: number;
  featuresList: { text: string; included: boolean }[];
  accentColor: string;
  borderColor: string;
}

const PRESETS: PlanPreset[] = [
  {
    planName: "BASIC",
    name: "Basic Plan",
    badge: "Inicial",
    price: "$15.000 / mes",
    desc: "Ideal para pequeños comercios y emprendimientos que se inician.",
    hasAfipBilling: false,
    hasPublicCatalog: false,
    hasClientLedger: false,
    hasMultiCashbox: false,
    hasSupplierFilter: false,
    hasBudget: false,
    hasNegativeStock: false,
    maxUsers: 1,
    maxProducts: 100,
    accentColor: "from-blue-500/10 to-indigo-500/5 text-blue-500 border-blue-200/50 dark:border-blue-800/40",
    borderColor: "hover:border-blue-400 focus:border-blue-400",
    featuresList: [
      { text: "1 Usuario Administrativo", included: true },
      { text: "Hasta 100 Productos", included: true },
      { text: "Facturación AFIP (ARCA)", included: false },
      { text: "Catálogo Público Web", included: false },
      { text: "Cuentas Corrientes (Ledger)", included: false },
      { text: "Múltiples Cajas de Venta", included: false },
      { text: "Filtro por Proveedor", included: false },
    ],
  },
  {
    planName: "PRO",
    name: "Pro Plan",
    badge: "Más Popular",
    price: "$45.000 / mes",
    desc: "Para comercios establecidos que necesitan automatizar su facturación.",
    hasAfipBilling: true,
    hasPublicCatalog: true,
    hasClientLedger: false,
    hasMultiCashbox: false,
    hasSupplierFilter: false,
    hasBudget: false,
    hasNegativeStock: true,
    maxUsers: 5,
    maxProducts: 1000,
    accentColor: "from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/40",
    borderColor: "hover:border-amber-400 focus:border-amber-400",
    featuresList: [
      { text: "Hasta 5 Usuarios", included: true },
      { text: "Hasta 1000 Productos", included: true },
      { text: "Facturación AFIP (ARCA) Integrada", included: true },
      { text: "Catálogo Público en Web", included: true },
      { text: "Cuentas Corrientes (Ledger)", included: false },
      { text: "Múltiples Cajas de Venta", included: false },
      { text: "Filtro por Proveedor", included: false },
    ],
  },
  {
    planName: "ENTERPRISE",
    name: "Premium / Enterprise",
    badge: "Ilimitado",
    price: "$120.000 / mes",
    desc: "Potencia total para franquicias, sucursales y operaciones complejas.",
    hasAfipBilling: true,
    hasPublicCatalog: true,
    hasClientLedger: true,
    hasMultiCashbox: true,
    hasSupplierFilter: true,
    hasBudget: true,
    hasNegativeStock: true,
    maxUsers: 999,
    maxProducts: 99999,
    accentColor: "from-purple-500/10 to-pink-500/5 text-purple-500 border-purple-200/50 dark:border-purple-800/40",
    borderColor: "hover:border-purple-400 focus:border-purple-400",
    featuresList: [
      { text: "Usuarios Ilimitados (Soporta 999)", included: true },
      { text: "Productos Ilimitados (Soporta 99999)", included: true },
      { text: "Facturación AFIP (ARCA) Integrada", included: true },
      { text: "Catálogo Público en Web", included: true },
      { text: "Cuentas Corrientes (Ledger)", included: true },
      { text: "Múltiples Cajas Operativas", included: true },
      { text: "Filtro por Proveedor", included: true },
    ],
  },
];

export function FeaturesForm({ businessId, businessName, planDefinitions, initialFeatures }: FeaturesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Find the matching PlanDefinition for the initial plan name
  const initialPlanDef = planDefinitions.find((p) => p.name === initialFeatures.plan);
  const initialPlanDefId = initialPlanDef?.id ?? initialFeatures.planDefinitionId;

  // Modular states — use planDefinitionId to track selected plan
  const [selectedPlanDefinitionId, setSelectedPlanDefinitionId] = useState(initialPlanDefId);
  const [hasAfipBilling, setHasAfipBilling] = useState(initialFeatures.hasAfipBilling);
  const [hasPublicCatalog, setHasPublicCatalog] = useState(initialFeatures.hasPublicCatalog);
  const [hasClientLedger, setHasClientLedger] = useState(initialFeatures.hasClientLedger);
  const [hasMultiCashbox, setHasMultiCashbox] = useState(initialFeatures.hasMultiCashbox);
  const [hasSupplierFilter, setHasSupplierFilter] = useState(initialFeatures.hasSupplierFilter);
  const [hasBudget, setHasBudget] = useState(initialFeatures.hasBudget);
  const [hasNegativeStock, setHasNegativeStock] = useState(initialFeatures.hasNegativeStock);
  const [maxUsers, setMaxUsers] = useState(initialFeatures.maxUsers);
  const [maxProducts, setMaxProducts] = useState(initialFeatures.maxProducts);

  const [isCustomOverride, setIsCustomOverride] = useState(false);

  // Resolve the selected plan name from planDefinitions for matching
  const selectedPlanName = planDefinitions.find((p) => p.id === selectedPlanDefinitionId)?.name ?? "";

  // Check if current states match any standard preset exactly
  useEffect(() => {
    const matchingPreset = PRESETS.find(
      (p) =>
        p.planName === selectedPlanName &&
        p.hasAfipBilling === hasAfipBilling &&
        p.hasPublicCatalog === hasPublicCatalog &&
        p.hasClientLedger === hasClientLedger &&
        p.hasMultiCashbox === hasMultiCashbox &&
        p.hasSupplierFilter === hasSupplierFilter &&
        p.hasBudget === hasBudget &&
        p.hasNegativeStock === hasNegativeStock &&
        p.maxUsers === maxUsers &&
        p.maxProducts === maxProducts
    );
    setIsCustomOverride(!matchingPreset);
  }, [selectedPlanName, hasAfipBilling, hasPublicCatalog, hasClientLedger, hasMultiCashbox, hasSupplierFilter, hasBudget, hasNegativeStock, maxUsers, maxProducts]);

  // Handle preset selection
  const handlePresetSelect = (preset: PlanPreset) => {
    // Find matching PlanDefinition by name
    const planDef = planDefinitions.find((p) => p.name === preset.planName);
    if (planDef) {
      setSelectedPlanDefinitionId(planDef.id);
    }
    setHasAfipBilling(preset.hasAfipBilling);
    setHasPublicCatalog(preset.hasPublicCatalog);
    setHasClientLedger(preset.hasClientLedger);
    setHasMultiCashbox(preset.hasMultiCashbox);
    setHasSupplierFilter(preset.hasSupplierFilter);
    setHasBudget(preset.hasBudget);
    setHasNegativeStock(preset.hasNegativeStock);
    setMaxUsers(preset.maxUsers);
    setMaxProducts(preset.maxProducts);
    toast.success(`Preset "${preset.name}" aplicado automáticamente.`);
  };

  // Build overrides by comparing form state against selected PlanDefinition defaults
  const buildOverrides = (): Record<string, any> | undefined => {
    const selectedPlanDef = planDefinitions.find((p) => p.id === selectedPlanDefinitionId);
    if (!selectedPlanDef) return undefined;

    const defaults: Record<string, any> = {
      ...(selectedPlanDef.features as Record<string, any>),
      ...(selectedPlanDef.limits as Record<string, any>),
    };

    const currentValues: Record<string, any> = {
      hasAfipBilling,
      hasPublicCatalog,
      hasClientLedger,
      hasMultiCashbox,
      hasSupplierFilter,
      hasBudget,
      maxUsers,
      maxProducts,
    };

    const overrides: Record<string, any> = {};
    for (const [key, value] of Object.entries(currentValues)) {
      if (value !== defaults[key]) {
        overrides[key] = value;
      }
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined;
  };

  // Submit action
  const handleSave = () => {
    startTransition(async () => {
      const overrides = buildOverrides();
      const payload = {
        businessId,
        planDefinitionId: selectedPlanDefinitionId,
        overrides,
      };

      const result = await updateBusinessFeaturesAction(payload);

      if (result.success) {
        toast.success("Características del negocio actualizadas con éxito.");
        router.refresh();
      } else {
        toast.error(result.error || "Hubo un problema al guardar los cambios.");
      }
    });
  };

  return (
    <div className="space-y-8 pb-12 animate-fade-in-up">
      {/* 1. Subscription Presets Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              1. Planes y Ajustes Predeterminados
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Seleccione un plan para alinear instantáneamente todos los toggles y límites operativos.
            </p>
          </div>

          {isCustomOverride && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-600 dark:text-amber-400 animate-pulse">
              <Settings2 className="w-3.5 h-3.5" />
              Overrides Activos (Personalizado)
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRESETS.map((preset) => {
            const isCurrentPresetSelected = selectedPlanName === preset.planName;
            const matchesExactState =
              isCurrentPresetSelected &&
              preset.hasAfipBilling === hasAfipBilling &&
              preset.hasPublicCatalog === hasPublicCatalog &&
              preset.hasClientLedger === hasClientLedger &&
              preset.hasMultiCashbox === hasMultiCashbox &&
              preset.maxUsers === maxUsers &&
              preset.maxProducts === maxProducts;

            return (
              <Card
                key={preset.planName}
                onClick={() => handlePresetSelect(preset)}
                className={`relative flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-xl border-2 ${
                  matchesExactState
                    ? "border-primary ring-2 ring-primary/20 bg-primary/[0.01]"
                    : isCurrentPresetSelected
                    ? "border-primary/50 border-dashed"
                    : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700"
                }`}
              >
                {/* Visual Highlight Badge */}
                {matchesExactState && (
                  <div className="absolute top-0 right-0 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider flex items-center gap-1 shadow-md">
                    <Check className="w-3 h-3 stroke-[3]" /> Activo
                  </div>
                )}

                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-gradient-to-r ${preset.accentColor}`}>
                      {preset.badge}
                    </span>
                  </div>
                  <CardTitle className="text-xl font-bold tracking-tight text-gray-900 dark:text-white mt-2">
                    {preset.name}
                  </CardTitle>
                  <CardDescription className="text-2xl font-extrabold text-primary tracking-tight mt-1">
                    {preset.price}
                  </CardDescription>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                    {preset.desc}
                  </p>
                </CardHeader>

                <CardContent className="pb-6 border-t border-gray-100 dark:border-slate-800/80 pt-4 flex-1">
                  <ul className="space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
                    {preset.featuresList.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {f.included ? (
                          <Check className="w-4 h-4 text-emerald-500 shrink-0 stroke-[2.5]" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 shrink-0 stroke-[2.5]" />
                        )}
                        <span className={f.included ? "font-medium text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}>
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="bg-gray-50 dark:bg-slate-900/50 p-4 border-t border-gray-100 dark:border-slate-850">
                  <Button
                    type="button"
                    variant={matchesExactState ? "default" : "outline"}
                    className="w-full text-xs font-semibold"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePresetSelect(preset);
                    }}
                  >
                    {matchesExactState ? "Preset Aplicado" : "Aplicar Preset"}
                    {!matchesExactState && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 2. Custom Feature Flags (Radix Switches) & Operational Limits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Modular Features Toggle (Left Side - 2 Cols) */}
        <Card className="lg:col-span-2 shadow-md border-gray-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-500" />
              2. Módulos y Características de Funcionalidad
            </CardTitle>
            <CardDescription>
              Habilite o deshabilite selectivamente módulos individuales para este comercio. Los cambios activarán la etiqueta &quot;Personalizado&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-gray-150 dark:divide-slate-800">
            {/* AFIP Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 shrink-0 mt-0.5">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Facturación AFIP (ARCA)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Permite emitir comprobantes electrónicos autorizados ante la AFIP con CAE automático.
                  </p>
                </div>
              </div>
              <Switch checked={hasAfipBilling} onCheckedChange={setHasAfipBilling} />
            </div>

            {/* Public Catalog Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 shrink-0 mt-0.5">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Catálogo Público Web</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Habilita la página de catálogo en línea público para que los clientes finales vean stock y realicen pedidos.
                  </p>
                </div>
              </div>
              <Switch checked={hasPublicCatalog} onCheckedChange={setHasPublicCatalog} />
            </div>

            {/* Client Ledger (Cuentas Corrientes) Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0 mt-0.5">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Cuentas Corrientes (Ledger)</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Registra y administra deudas, saldos y pagos históricos por cliente con su respectiva cuenta corriente.
                  </p>
                </div>
              </div>
              <Switch checked={hasClientLedger} onCheckedChange={setHasClientLedger} />
            </div>

            {/* Multi Cashbox Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 shrink-0 mt-0.5">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Múltiples Cajas Operativas</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Permite abrir múltiples cajas y sesiones diarias en simultáneo asignando cajeros independientes.
                  </p>
                </div>
              </div>
              <Switch checked={hasMultiCashbox} onCheckedChange={setHasMultiCashbox} />
            </div>

            {/* Supplier Filter Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 shrink-0 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Filtro por Proveedor</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Habilita el filtro por proveedor en la pantalla de facturación para buscar productos de un proveedor específico.
                  </p>
                </div>
              </div>
              <Switch checked={hasSupplierFilter} onCheckedChange={setHasSupplierFilter} />
            </div>

            {/* Budget Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 shrink-0 mt-0.5">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Presupuestos</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Permite crear presupuestos (órdenes sin confirmar) que aparecen en Cuenta Corriente y pueden imprimirse.
                  </p>
                </div>
              </div>
              <Switch checked={hasBudget} onCheckedChange={setHasBudget} />
            </div>

            {/* Negative Stock Toggle */}
            <div className="flex items-start justify-between py-4 gap-4">
              <div className="flex gap-3">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-600 shrink-0 mt-0.5">
                  <MinusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Stock Negativo</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Permite que el stock de productos quede en valores negativos al vender sin inventario suficiente.
                  </p>
                </div>
              </div>
              <Switch checked={hasNegativeStock} onCheckedChange={setHasNegativeStock} />
            </div>
          </CardContent>
        </Card>

        {/* Operational Limits Controls (Right Side - 1 Col) */}
        <Card className="shadow-md border-gray-200 dark:border-slate-800 flex flex-col justify-between">
          <div>
            <CardHeader>
              <CardTitle className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-500" />
                Límites Operativos
              </CardTitle>
              <CardDescription>
                Configure las capacidades del comercio de acuerdo a las restricciones acordadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Max Users Limit */}
              <div className="space-y-2">
                <Label htmlFor="maxUsers" className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-500" />
                  Límite de Usuarios
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setMaxUsers(Math.max(1, maxUsers - 1))}
                    disabled={maxUsers <= 1}
                  >
                    -
                  </Button>
                  <Input
                    id="maxUsers"
                    type="number"
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-center font-semibold font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setMaxUsers(maxUsers + 1)}
                  >
                    +
                  </Button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  999 representa capacidad ilimitada.
                </p>
              </div>

              {/* Max Products Limit */}
              <div className="space-y-2">
                <Label htmlFor="maxProducts" className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-500" />
                  Límite de Productos
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setMaxProducts(Math.max(10, maxProducts - 50))}
                    disabled={maxProducts <= 10}
                  >
                    -
                  </Button>
                  <Input
                    id="maxProducts"
                    type="number"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.max(1, parseInt(e.target.value) || 1))}
                    className="text-center font-semibold font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setMaxProducts(maxProducts + 50)}
                  >
                    +
                  </Button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  99999 representa capacidad ilimitada.
                </p>
              </div>
            </CardContent>
          </div>

          <div className="p-6 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/20">
            <div className="flex flex-col gap-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-gray-300">Resumen de Límites:</span>
              <span>Usuarios Máximos: {maxUsers === 999 ? "Ilimitados" : maxUsers}</span>
              <span>Productos Máximos: {maxProducts === 99999 ? "Ilimitados" : maxProducts}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. Action Section (Save Card) */}
      <Card className="border border-primary/20 bg-gradient-to-br from-white to-primary/[0.01] dark:from-slate-950 dark:to-primary/[0.01] shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary animate-spin" style={{ animationDuration: '6s' }} />
                Confirmación de Características para {businessName}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los límites y toggles configurados impactarán inmediatamente en la experiencia de todos los usuarios del negocio.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const resetPlanDef = planDefinitions.find((p) => p.name === initialFeatures.plan);
                  if (resetPlanDef) setSelectedPlanDefinitionId(resetPlanDef.id);
                  setHasAfipBilling(initialFeatures.hasAfipBilling);
                  setHasPublicCatalog(initialFeatures.hasPublicCatalog);
                  setHasClientLedger(initialFeatures.hasClientLedger);
                  setHasMultiCashbox(initialFeatures.hasMultiCashbox);
                  setHasSupplierFilter(initialFeatures.hasSupplierFilter);
                  setHasBudget(initialFeatures.hasBudget);
                  setHasNegativeStock(initialFeatures.hasNegativeStock);
                  setMaxUsers(initialFeatures.maxUsers);
                  setMaxProducts(initialFeatures.maxProducts);
                  toast.info("Configuración revertida a los valores guardados.");
                }}
                disabled={isPending}
                className="text-xs font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Revertir Cambios
              </Button>

              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="text-xs font-semibold shadow-md shadow-primary/10 transition-all duration-200"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>Guardar Configuración</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
