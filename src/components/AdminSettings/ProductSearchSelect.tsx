"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getProductsBySearch } from "@/actions/stock";
import { ProductPrismaAdapter } from "@/models/ProductPrismaAdapter";
import Product from "@/models/Product";
import { cn } from "@/lib/utils";

export interface ProductSearchSelectProps {
  /** Called when a product is selected from the dropdown */
  onSelect: (product: Product) => void;
  /** Called when the user wants to clear the current selection */
  onClear?: () => void;
  /** Currently selected product (if any) */
  selectedProduct?: Product | null;
  /** Placeholder text for the search input */
  placeholder?: string;
  /** Optional supplierId filter for the search */
  supplierId?: string;
  /** Whether to show stock info in suggestions */
  showStock?: boolean;
  /** Whether to show the selected product card before the input */
  showSelectedCard?: boolean;
  /** Extra CSS classes for the container */
  className?: string;
  /** The search term to display (for controlled mode like shortcut settings) */
  searchTerm?: string;
  /** Called when the search term changes */
  onSearchTermChange?: (value: string) => void;
}

const ProductSearchSelect: React.FC<ProductSearchSelectProps> = ({
  onSelect,
  onClear,
  selectedProduct,
  placeholder = "Buscar producto por código o nombre...",
  supplierId,
  showStock = false,
  showSelectedCard = false,
  className,
  searchTerm: externalSearchTerm,
  onSearchTermChange,
}) => {
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Controlled or uncontrolled search term
  const searchTerm = externalSearchTerm ?? internalSearchTerm;
  const setSearchTerm = onSearchTermChange ?? setInternalSearchTerm;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`ps-suggestion-${selectedIndex}`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const results = await getProductsBySearch(query);
      setSuggestions(results.map(ProductPrismaAdapter.toDomain));
      setIsOpen(true);
    } catch {
      setSuggestions([]);
    }
    setLoading(false);
  }, [supplierId]);

  const debouncedSearch = useCallback((value: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (value.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  }, [performSearch]);

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    setSelectedIndex(-1);
    debouncedSearch(value);
  };

  const handleSelect = (product: Product) => {
    onSelect(product);
    setSuggestions([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    if (!externalSearchTerm) {
      setInternalSearchTerm(`${product.code} - ${product.description}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
        handleSelect(suggestions[selectedIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length === 0) {
        // Trigger search with empty to show all products
        performSearch(searchTerm || " ");
      } else {
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSuggestions([]);
      setSelectedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Selected product card — shown before the search input */}
      {showSelectedCard && selectedProduct && (
        <div className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {selectedProduct.description}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                  {selectedProduct.code}
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  ${selectedProduct.salePrice.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                {showStock && (
                  <span className={cn(
                    "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                    selectedProduct.amount <= 5
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  )}>
                    Stock: {selectedProduct.amount}
                  </span>
                )}
              </div>
            </div>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-gray-400 hover:text-red-500 transition-colors shrink-0"
                aria-label="Quitar producto"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          placeholder={placeholder}
          value={selectedProduct && !isOpen && !searchTerm ? `${selectedProduct.code} - ${selectedProduct.description}` : searchTerm}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
          {suggestions.map((product, index) => (
            <button
              key={product.id}
              id={`ps-suggestion-${index}`}
              type="button"
              className={cn(
                "w-full text-left px-3 py-2.5 text-sm border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors",
                index === selectedIndex
                  ? "bg-blue-50 dark:bg-gray-700 border-l-2 border-l-blue-500"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700 border-l-2 border-l-transparent"
              )}
              onClick={() => handleSelect(product)}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                    {product.code}
                  </span>
                  {product.brand && (
                    <span className="ml-1.5 text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-400">
                      {product.brand}
                    </span>
                  )}
                  <span className="ml-2 font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {product.description}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {showStock && (
                    <span className={cn(
                      "text-xs font-semibold",
                      product.amount <= 5 ? "text-orange-500" : "text-green-500"
                    )}>
                      {product.amount} u.
                    </span>
                  )}
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    ${product.salePrice.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && searchTerm.length >= 2 && suggestions.length === 0 && !loading && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl p-3 text-sm text-gray-400">
          Sin resultados
        </div>
      )}

      {/* Selected product info shown below the input when not showing card */}
      {!showSelectedCard && selectedProduct && !isOpen && (
        <div className="mt-1.5 flex items-center justify-between px-1">
          <p className="text-xs text-gray-500 truncate">
            {selectedProduct.description} — ${selectedProduct.salePrice.toFixed(2)}
          </p>
          {selectedProduct && onClear && (
            <button
              onClick={onClear}
              className="text-xs text-red-500 hover:text-red-700 transition-colors shrink-0 ml-2"
            >
              Quitar
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchSelect;
