"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getShortcutConfigsAction,
  saveShortcutConfigAction,
  deleteShortcutConfigAction,
} from "@/actions/shortcuts";
import { getProductsBySearch } from "@/actions/stock";
import { ProductPrismaAdapter } from "@/models/ProductPrismaAdapter";
import type { ShortcutConfigView, ShortcutKey } from "@/models/ShortcutConfig";
import Product from "@/models/Product";

const SHORTCUT_KEYS: ShortcutKey[] = ["F1", "F2", "F3"];

interface Props {
  businessId: string;
}

const ShortcutConfigSection = ({ businessId }: Props) => {
  const [configs, setConfigs] = useState<ShortcutConfigView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({
    F1: "",
    F2: "",
    F3: "",
  });
  const [suggestions, setSuggestions] = useState<Record<string, Product[]>>({
    F1: [],
    F2: [],
    F3: [],
  });
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, Product | null>
  >({
    F1: null,
    F2: null,
    F3: null,
  });
  const [openDropdown, setOpenDropdown] = useState<ShortcutKey | null>(null);
  const searchTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
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
        if (config.key && config.product) {
          // Create a Product-like object from the config product data
          const product = new Product();
          product.id = config.product.id;
          product.description = config.product.description;
          product.code = config.product.code;
          product.salePrice = config.product.salePrice;
          products[config.key] = product;
          terms[config.key] = `${config.product.code} - ${config.product.description}`;
        }
      }
      setSelectedProducts(products);
      setSearchTerms(terms);
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      for (const key of SHORTCUT_KEYS) {
        const container = containerRefs.current[key];
        if (container && !container.contains(event.target as Node)) {
          setOpenDropdown(null);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchChange = (key: ShortcutKey, value: string) => {
    setSearchTerms((prev) => ({ ...prev, [key]: value }));
    setOpenDropdown(key);

    // Clear timeout
    if (searchTimeoutRef.current[key]) {
      clearTimeout(searchTimeoutRef.current[key]);
    }

    if (value.length < 2) {
      setSuggestions((prev) => ({ ...prev, [key]: [] }));
      return;
    }

    searchTimeoutRef.current[key] = setTimeout(async () => {
      const results = await getProductsBySearch(value);
      setSuggestions((prev) => ({
        ...prev,
        [key]: results.map(ProductPrismaAdapter.toDomain),
      }));
    }, 300);
  };

  const handleSelectProduct = (key: ShortcutKey, product: Product) => {
    setSelectedProducts((prev) => ({ ...prev, [key]: product }));
    setSearchTerms((prev) => ({
      ...prev,
      [key]: `${product.code} - ${product.description}`,
    }));
    setSuggestions((prev) => ({ ...prev, [key]: [] }));
    setOpenDropdown(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const key of SHORTCUT_KEYS) {
        const selected = selectedProducts[key];
        const existingConfig = configs.find((c) => c.key === key);

        if (selected) {
          // Save the shortcut
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
          // No product selected but there's an existing config → delete it
          await deleteShortcutConfigAction(businessId, key);
        }
      }
      toast.success("Atajos guardados correctamente");
      await fetchConfigs();
    } catch (error) {
      toast.error("Error al guardar los atajos");
      console.error(error);
    }
    setSaving(false);
  };

  const handleClear = async (key: ShortcutKey) => {
    setSelectedProducts((prev) => ({ ...prev, [key]: null }));
    setSearchTerms((prev) => ({ ...prev, [key]: "" }));
    setSuggestions((prev) => ({ ...prev, [key]: [] }));

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

  if (loading) {
    return (
      <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold mb-4">Atajos de teclado</h2>
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <h2 className="text-xl font-semibold mb-4">Atajos de teclado</h2>
      <p className="text-sm text-gray-500 mb-4">
        Configure productos de precio variable para acceder rápidamente con las
        teclas F1, F2 y F3 en la pantalla de facturación.
      </p>

      <div className="space-y-4">
        {SHORTCUT_KEYS.map((key) => {
          const config = configs.find((c) => c.key === key);
          const selected = selectedProducts[key];
          return (
            <div
              key={key}
              className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg"
            >
              <div className="w-12 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-600 rounded font-mono font-bold text-sm shrink-0">
                {key}
              </div>
              <div
                className="flex-1 relative"
                ref={(el) => {
                  containerRefs.current[key] = el;
                }}
              >
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Buscar producto por código o nombre..."
                  value={searchTerms[key]}
                  onChange={(e) => handleSearchChange(key, e.target.value)}
                  onFocus={() => {
                    if (searchTerms[key].length >= 2) {
                      setOpenDropdown(key);
                    }
                  }}
                  autoComplete="off"
                />
                {selected && searchTerms[key] && !openDropdown && (
                  <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      {selected.description} — ${selected.salePrice.toFixed(2)}
                    </p>
                  </div>
                )}
                {openDropdown === key && suggestions[key].length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {suggestions[key].map((product) => (
                      <button
                        key={product.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
                        onClick={() => handleSelectProduct(key, product)}
                      >
                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                          {product.code}
                        </span>
                        <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                          {product.description}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          ${product.salePrice.toFixed(2)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {openDropdown === key &&
                  searchTerms[key].length >= 2 &&
                  suggestions[key].length === 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 text-sm text-gray-400">
                      Sin resultados
                    </div>
                  )}
              </div>
              {selected || config?.product ? (
                <button
                  onClick={() => handleClear(key)}
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500 transition-colors shrink-0"
                  aria-label={`Limpiar atajo ${key}`}
                  title="Quitar producto"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
};

export default ShortcutConfigSection;
