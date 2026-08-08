"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getShortcutConfigsAction,
  saveShortcutConfigAction,
  deleteShortcutConfigAction,
} from "@/actions/shortcuts";
import type { ShortcutConfigView, ShortcutKey } from "@/models/ShortcutConfig";
import Product from "@/models/Product";
import ProductSearchSelect from "./ProductSearchSelect";
import { cn } from "@/lib/utils";

const SHORTCUT_KEYS: ShortcutKey[] = ["F1", "F2", "F3"];

const SHORTCUT_LABELS: Record<ShortcutKey, string> = {
  F1: "Atajo F1",
  F2: "Atajo F2",
  F3: "Atajo F3",
};

interface Props {
  businessId: string;
}

const ShortcutConfigSection = ({ businessId }: Props) => {
  const [configs, setConfigs] = useState<ShortcutConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, Product | null>
  >({
    F1: null,
    F2: null,
    F3: null,
  });
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({
    F1: "",
    F2: "",
    F3: "",
  });
  const [dirty, setDirty] = useState(false);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const result = await getShortcutConfigsAction(businessId);
    if ("success" in result && result.success) {
      setConfigs(result.data);
      // Pre-populate selected products from existing configs
      const products: Record<string, Product | null> = {
        F1: null,
        F2: null,
        F3: null,
      };
      const terms: Record<string, string> = { F1: "", F2: "", F3: "" };
      for (const config of result.data) {
        if (config.key) {
          if (config.product) {
            const product = new Product();
            product.id = config.product.id;
            product.description = config.product.description;
            product.code = config.product.code;
            product.salePrice = config.product.salePrice;
            products[config.key] = product;
            terms[config.key] = `${config.product.code} - ${config.product.description}`;
          } else {
            terms[config.key] = "[Producto eliminado]";
          }
        }
      }
      setSelectedProducts(products);
      setSearchTerms(terms);
    } else {
      const errResult = result as { error?: string };
      setFetchError(errResult.error || "Error al cargar configuraciones");
    }
    setLoading(false);
  }, [businessId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSelectProduct = (key: ShortcutKey, product: Product) => {
    setSelectedProducts((prev) => ({ ...prev, [key]: product }));
    setSearchTerms((prev) => ({
      ...prev,
      [key]: `${product.code} - ${product.description}`,
    }));
    setDirty(true);
  };

  const handleClear = async (key: ShortcutKey) => {
    setSelectedProducts((prev) => ({ ...prev, [key]: null }));
    setSearchTerms((prev) => ({ ...prev, [key]: "" }));
    setDirty(true);

    // Also delete immediately if there's an existing config
    const existingConfig = configs.find((c) => c.key === key);
    if (existingConfig) {
      const result = await deleteShortcutConfigAction(businessId, key);
      if ("success" in result && result.success) {
        toast.success(`Atajo ${key} eliminado`);
        await fetchConfigs();
      } else {
        const errResult = result as { error?: string };
        toast.error(
          `Error al eliminar atajo ${key}: ${errResult.error || "Error desconocido"}`
        );
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const key of SHORTCUT_KEYS) {
        const selected = selectedProducts[key];
        const existingConfig = configs.find((c) => c.key === key);

        if (selected) {
          const result = await saveShortcutConfigAction(
            businessId,
            key,
            selected.id
          );
          if (!("success" in result) || !result.success) {
            const errResult = result as { error?: string };
            toast.error(
              `Error al guardar ${key}: ${errResult.error || "Error desconocido"}`
            );
            setSaving(false);
            return;
          }
        } else if (existingConfig) {
          await deleteShortcutConfigAction(businessId, key);
        }
      }
      toast.success("Atajos guardados correctamente");
      setDirty(false);
      await fetchConfigs();
    } catch (error) {
      toast.error("Error al guardar los atajos");
      console.error(error);
    }
    setSaving(false);
  };

  const configuredCount = SHORTCUT_KEYS.filter(
    (k) => selectedProducts[k] !== null
  ).length;

  if (loading) {
    return (
      <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Atajos de teclado</h2>
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Atajos de teclado</h2>
        <p className="text-red-500">{fetchError}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">Atajos de teclado</h2>
        {configuredCount > 0 && (
          <span className="text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full">
            {configuredCount} de {SHORTCUT_KEYS.length} configurados
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Configure productos de precio variable para acceder rápidamente con las
        teclas <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">F1</kbd>,{" "}
        <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">F2</kbd> y{" "}
        <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">F3</kbd>{" "}
        en la pantalla de facturación.
      </p>

      <div className="space-y-4">
        {SHORTCUT_KEYS.map((key) => {
          const selected = selectedProducts[key];
          const config = configs.find((c) => c.key === key);
          const hasExisting = !!(selected || config?.product);

          return (
            <div
              key={key}
              className={cn(
                "flex items-start gap-4 p-4 rounded-lg border transition-colors",
                hasExisting
                  ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                  : "bg-gray-50 dark:bg-gray-700/30 border-transparent"
              )}
            >
              {/* Key badge */}
              <div className={cn(
                "w-12 h-10 flex items-center justify-center rounded font-mono font-bold text-sm shrink-0 mt-1",
                hasExisting
                  ? "bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              )}>
                {key}
              </div>

              {/* Search / selected product */}
              <div className="flex-1 min-w-0">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                  {SHORTCUT_LABELS[key]}
                </label>
                <ProductSearchSelect
                  onSelect={(product) => handleSelectProduct(key, product)}
                  onClear={() => handleClear(key)}
                  selectedProduct={selected || null}
                  searchTerm={searchTerms[key]}
                  onSearchTermChange={(value) => {
                    setSearchTerms((prev) => ({ ...prev, [key]: value }));
                    setDirty(true);
                  }}
                  showSelectedCard={true}
                  showStock={false}
                  placeholder="Buscar producto por código o nombre..."
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Save button — only show if there are changes */}
      {dirty && (
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => {
              fetchConfigs();
              setDirty(false);
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando...
              </span>
            ) : (
              "Guardar cambios"
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default ShortcutConfigSection;
