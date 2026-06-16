"use client";
import React, { useState, useRef, useEffect } from "react";
import { getProductByCode, getProductsBySearch, getSuppliersForFilter } from "@/actions/stock";
import { ProductPrismaAdapter } from "@/models/ProductPrismaAdapter";
import Product from "@/models/Product";
import { IDetectedBarcode, Scanner } from "@yudiel/react-qr-scanner";
import { cn } from "@/lib/utils";

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductSearchBarProps {
  onProductAdd: (product: Product) => void;
  hasSupplierFilter: boolean;
}

const ProductSearchBar = ({ onProductAdd, hasSupplierFilter }: ProductSearchBarProps) => {
  const [searchCode, setSearchCode] = useState("");
  const searchCodeRef = useRef("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isBarcodeMode, setIsBarcodeMode] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const supplierContainerRef = useRef<HTMLDivElement>(null);
  const lastKeystrokeTime = useRef<number>(0);
  const barcodeTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Fetch suppliers on mount
  useEffect(() => {
    if (hasSupplierFilter) {
      getSuppliersForFilter().then(setSuppliers);
    }
  }, [hasSupplierFilter]);

  // Close suggestions and supplier dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSuggestions([]);
        setSelectedIndex(-1);
      }
      if (supplierContainerRef.current && !supplierContainerRef.current.contains(event.target as Node)) {
        setSupplierOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-hide error after 3s
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`suggestion-item-${selectedIndex}`);
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // Global "/" key to focus search input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("product-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const performSearch = async (value: string, supId: string) => {
    const results = await getProductsBySearch(value, supId || undefined);
    setSuggestions(results.map(ProductPrismaAdapter.toDomain));
  };

  // Refresh suggestions when supplier changes and there's an active search
  useEffect(() => {
    if (searchCodeRef.current.length >= 2) {
      performSearch(searchCodeRef.current, supplierId);
    }
  }, [supplierId]);

  const handleSearch = (value: string) => {
    setSearchCode(value);
    searchCodeRef.current = value;
    setSelectedIndex(-1);

    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();

    if (barcodeTimeout.current) {
      clearTimeout(barcodeTimeout.current);
    }

    const timeSinceLastKeystroke = lastKeystrokeTime.current === 0 ? 50 : now - lastKeystrokeTime.current;
    lastKeystrokeTime.current = now;

    const isCurrentlyBarcode = timeSinceLastKeystroke < 50;

    if (isCurrentlyBarcode) {
      setIsBarcodeMode(true);
    } else {
      setIsBarcodeMode(false);
    }

    if (isCurrentlyBarcode) {
      const currentValue = value;
      barcodeTimeout.current = setTimeout(() => {
        if (currentValue.length >= 3) {
          processBarcode(currentValue);
        } else {
          setIsBarcodeMode(false);
          lastKeystrokeTime.current = 0;
        }
      }, 300);
      return;
    }

    // Debounce manual typing search
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (value.length >= 2) {
      searchTimeout.current = setTimeout(() => {
        performSearch(value, supplierId);
      }, 300);
    } else {
      setSuggestions([]);
    }
  };

  const processBarcode = async (code: string) => {
    const product = await getProductByCode(code);
    if (!product) {
      setErrorMessage("Producto no encontrado");
      setSearchCode("");
      setSuggestions([]);
    } else if (product.amount <= 0) {
      setErrorMessage("Producto sin Stock");
      setSearchCode("");
      setSuggestions([]);
    } else {
      const adaptedProduct = ProductPrismaAdapter.toDomain(product);
      onProductAdd({ ...adaptedProduct, amount: 1 });
      setSearchCode("");
      setSuggestions([]);
      setSelectedIndex(-1);
    }
    setIsBarcodeMode(false);
    lastKeystrokeTime.current = 0;
  };

  const handleAddProduct = async (code: string) => {
    const product = await getProductByCode(code);
    if (!product) {
      setErrorMessage("Producto no encontrado");
      return;
    }
    if (product.amount <= 0) {
      setErrorMessage("Producto sin Stock");
      return;
    }
    const adaptedProduct = ProductPrismaAdapter.toDomain(product);
    onProductAdd({ ...adaptedProduct, amount: 1 });
    setSearchCode("");
    setSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleScannerResult = (result: IDetectedBarcode[]) => {
    if (result && result.length > 0) {
      handleAddProduct(result[0].rawValue);
    }
    setScannerOpen(false);
  };

  const filteredSuppliers = suppliers.filter((s) =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const selectedSupplierName = suppliers.find((s) => s.id === supplierId)?.name || "Todos los proveedores";

  return (
    <div className="mb-6 max-w-7xl mx-auto print:hidden">
      <div className="flex gap-3">
        <div ref={searchContainerRef} className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <input
            id="product-search-input"
            name="productSearch"
            className={cn(
              "flex w-full rounded-lg border border-input bg-white dark:bg-gray-800 px-3 py-3 pl-10 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-gray-900 dark:text-gray-100",
              isBarcodeMode && "border-blue-500 ring-2 ring-blue-500 dark:border-blue-400 dark:ring-blue-400"
            )}
            placeholder="Buscar producto por codigo o nombre (Presiona '/' para buscar)..."
            value={searchCode}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
                  handleAddProduct(suggestions[selectedIndex].code);
                } else {
                  handleAddProduct(searchCode);
                }
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (suggestions.length === 0) {
                  getProductsBySearch("", supplierId || undefined).then(results => {
                    setSuggestions(results.map(ProductPrismaAdapter.toDomain));
                    setSelectedIndex(0);
                  });
                } else {
                  setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
                }
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, -1));
              } else if (e.key === "Escape") {
                setSuggestions([]);
                setSelectedIndex(-1);
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-72 overflow-y-auto">
              {suggestions.map((product, index) => (
                <div
                  key={product.id}
                  id={`suggestion-item-${index}`}
                  className={cn(
                    "p-4 border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors",
                    index === selectedIndex
                      ? "bg-blue-50 dark:bg-gray-700 border-l-4 border-l-blue-500"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700 border-l-4 border-l-transparent"
                  )}
                  onClick={() => handleAddProduct(product.code)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{product.code}</span>
                      {product.brand && (
                        <span className="ml-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                          {product.brand}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "font-semibold text-xs px-2 py-1 rounded-full",
                      product.amount <= 5 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    )}>
                      Stock: {product.amount}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                    {product.description}
                  </div>
                  <div className="mt-1 font-bold text-lg text-gray-700 dark:text-gray-300">
                    ${product.salePrice.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supplier combobox */}
        {hasSupplierFilter && (
          <div ref={supplierContainerRef} className="relative">
            <button
              type="button"
              onClick={() => setSupplierOpen(!supplierOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-3 rounded-lg border border-input bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors min-w-[180px]",
                supplierOpen && "ring-1 ring-ring"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-400"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
              <span className="truncate max-w-[120px]">{selectedSupplierName}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-auto text-gray-400"><path d="m6 9 6 6 6-6"/></svg>
            </button>

            {supplierOpen && (
              <div className="absolute right-0 z-20 mt-2 w-[220px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl overflow-hidden">
                <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierId("");
                      setSupplierSearch("");
                      setSupplierOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700",
                      !supplierId ? "bg-blue-50 dark:bg-gray-700 font-semibold text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                    )}
                  >
                    Todos los proveedores
                  </button>
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierSearch("");
                        setSupplierOpen(false);
                      }}
                      className={cn(
                        "w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700",
                        supplierId === s.id ? "bg-blue-50 dark:bg-gray-700 font-semibold text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                  {filteredSuppliers.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-400 text-center">Sin resultados</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scanner button */}
        <button
          className="px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => setScannerOpen(true)}
          aria-label="Escanear codigo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
            <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
            <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
            <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
            <line x1="7" y1="12" x2="17" y2="12"/>
          </svg>
        </button>
      </div>

      {errorMessage && (
        <div className="text-red-500 mt-2 text-sm font-medium">{errorMessage}</div>
      )}

      {/* Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center print-hidden">
          <div className="bg-white p-4 rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Escanear producto</h3>
              <button
                className="text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400 rounded p-1 transition-colors"
                onClick={() => setScannerOpen(false)}
                aria-label="Cerrar escáner"
              >
                ✕
              </button>
            </div>
            <Scanner formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
              onScan={handleScannerResult}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductSearchBar;
