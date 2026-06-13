"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createProductsBulk, BulkProductInput, previewProductsBulk, PreviewProductsBulkResult } from "@/actions/stock";
import { toast } from "sonner";
import { UploadCloud, CheckCircle2, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { getSuppliers, createSupplier as createSupplierAction } from "@/actions/stock";
import type { Supplier } from "@prisma/client";
import CreateAttributeModal from "./create-attribute-modal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function ExcelUploadModal({ open, onOpenChange, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [startRow, setStartRow] = useState(2);
  const [endRow, setEndRow] = useState<number | "">("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [step, setStep] = useState<"config" | "preview">("config");
  const [previewData, setPreviewData] = useState<PreviewProductsBulkResult["preview"] | null>(null);
  const [parsedProductsState, setParsedProductsState] = useState<BulkProductInput[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [adjustmentDiscount, setAdjustmentDiscount] = useState(0);
  const [adjustmentIva, setAdjustmentIva] = useState("0");
  const [adjustmentGain, setAdjustmentGain] = useState(0);
  const [updateOnly, setUpdateOnly] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  useEffect(() => {
    if (open) {
      getSuppliers().then(setSuppliers);
    }
  }, [open]);

  const handleSupplierSelect = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setAdjustmentDiscount(supplier.discount ?? 0);
      setAdjustmentIva(String(supplier.iva ?? 0));
      setAdjustmentGain(supplier.gain ?? 0);
    }
  };

  const handleSupplierCreated = (item: { id: string; name: string }) => {
    setSelectedSupplierId(item.id);
    getSuppliers().then(suppliers => {
      setSuppliers(suppliers);
      const supplier = suppliers.find(s => s.id === item.id);
      if (supplier) {
        setAdjustmentDiscount(supplier.discount ?? 0);
        setAdjustmentIva(String(supplier.iva ?? 0));
        setAdjustmentGain(supplier.gain ?? 0);
      }
    });
  };

  // Column Mappings
  const [colCode, setColCode] = useState("A");
  const [colDescription, setColDescription] = useState("B");
  const [colPrice, setColPrice] = useState("C");
  const [colAmount, setColAmount] = useState("");
  const [colBrand, setColBrand] = useState("");
  const [colCategory, setColCategory] = useState("");
  const [colSubCategory, setColSubCategory] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const getColIndex = (letter: string) => {
    if (!letter) return -1;
    let index = 0;
    const cleanLetter = letter.toUpperCase().trim();
    for (let i = 0; i < cleanLetter.length; i++) {
        index = index * 26 + cleanLetter.charCodeAt(i) - 64;
    }
    return index - 1; // 0-based index
  };

  const handlePreview = async () => {
    setErrorMsg(null);
    if (!file) {
      setErrorMsg("Seleccione un archivo Excel primero.");
      return;
    }

    if (!colCode || !colDescription || !colPrice) {
      setErrorMsg("Debe especificar las columnas obligatorias: Código, Descripción y Precio.");
      return;
    }

    setLoading(true);
    console.log("Iniciando procesamiento de archivo:", file.name);

    try {
      const data = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[sheetName];
      
      console.log("Leyendo hoja:", sheetName);
      
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];
      console.log("Filas encontradas en el archivo:", jsonData.length);
      
      if (jsonData.length === 0) {
        toast.error("El archivo Excel parece estar vacío");
        setLoading(false);
        return;
      }

      const parsedProducts: BulkProductInput[] = [];
      
      const sRow = Math.max(0, startRow - 1);
      const eRow = endRow !== "" ? Math.min(jsonData.length, Number(endRow)) : jsonData.length;

      const idxCode = getColIndex(colCode);
      const idxDesc = getColIndex(colDescription);
      const idxPrice = getColIndex(colPrice);
      const idxAmount = getColIndex(colAmount);
      const idxBrand = getColIndex(colBrand);
      const idxCategory = getColIndex(colCategory);
      const idxSubCategory = getColIndex(colSubCategory);

      console.log("Mapeo de columnas (Indices):", { 
        code: idxCode, 
        desc: idxDesc, 
        price: idxPrice, 
        amount: idxAmount 
      });

      for (let i = sRow; i < eRow; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) {
            console.log(`Fila ${i + 1} está vacía, saltando.`);
            continue;
        }

        const codeVal = row[idxCode];
        const descVal = row[idxDesc];
        const priceVal = row[idxPrice];

        // Debugging first few rows
        if (i < sRow + 5) {
            console.log(`Fila ${i + 1} data:`, { codeVal, descVal, priceVal });
        }

        if (codeVal === undefined || descVal === undefined || priceVal === undefined || 
            codeVal === "" || descVal === "") {
           // Skip invalid rows missing mandatory fields
           continue; 
        }

        parsedProducts.push({
          code: String(codeVal),
          description: String(descVal),
          price: typeof priceVal === 'number' ? priceVal : parseFloat(String(priceVal).replace(',', '.')),
          amount: idxAmount >= 0 ? (row[idxAmount] !== undefined && row[idxAmount] !== null && row[idxAmount] !== '' ? (typeof row[idxAmount] === 'number' ? row[idxAmount] : parseFloat(String(row[idxAmount]).replace(',', '.'))) : null) : null,
          brandName: idxBrand >= 0 ? String(row[idxBrand] || "") : undefined,
          categoryName: idxCategory >= 0 ? String(row[idxCategory] || "") : undefined,
          subCategoryName: idxSubCategory >= 0 ? String(row[idxSubCategory] || "") : undefined,
        });
      }

      if (parsedProducts.length === 0) {
        // Find the first non-empty row to give a helpful error
        let sampleRow = "";
        for (let i = sRow; i < eRow; i++) {
          const row = jsonData[i];
          if (row && row.length > 0) {
             const c = row[idxCode];
             const d = row[idxDesc];
             const p = row[idxPrice];
             sampleRow = `Ejemplo fila ${i+1}: Código=${c ?? 'vacío'}, Desc=${d ?? 'vacío'}, Precio=${p ?? 'vacío'}.`;
             break;
          }
        }
        setErrorMsg(`No se encontraron productos válidos. Verifique las letras de las columnas. ${sampleRow}`);
        setLoading(false);
        return;
      }

      toast.loading(`Generando vista previa de ${parsedProducts.length} productos...`, { id: "bulk-import" });
      
      const result = await previewProductsBulk(
        parsedProducts, 
        updateExisting, 
        updateOnly, 
        adjustmentDiscount, 
        parseFloat(adjustmentIva), 
        adjustmentGain, 
        selectedSupplierId || undefined
      );
      
      if (result.error) {
        setErrorMsg(result.error);
        toast.dismiss("bulk-import");
      } else if (result.preview) {
        toast.dismiss("bulk-import");
        setParsedProductsState(parsedProducts);
        setPreviewData(result.preview);
        setStep("preview");
      }
    } catch (error) {
      console.error("Error detallado en procesamiento de Excel:", error);
      setErrorMsg("Ocurrió un error al procesar el archivo. Verifique el formato.");
      toast.dismiss("bulk-import");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    toast.loading(`Importando ${parsedProductsState.length} productos...`, { id: "bulk-confirm" });
    try {
      const result = await createProductsBulk(
        parsedProductsState, 
        updateExisting, 
        updateOnly, 
        adjustmentDiscount, 
        parseFloat(adjustmentIva), 
        adjustmentGain, 
        selectedSupplierId || undefined
      );
      if (result.error) {
        toast.error(result.error, { id: "bulk-confirm" });
      } else {
        toast.success(result.success, { id: "bulk-confirm" });
        setStep("config");
        setPreviewData(null);
        setParsedProductsState([]);
        onSuccess();
        onOpenChange(false);
      }
    } catch {
      toast.error("Error al importar.", { id: "bulk-confirm" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) {
        setStep("config");
        setPreviewData(null);
        setErrorMsg(null);
      }
      onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                <UploadCloud className="h-5 w-5" />
            </div>
            <div>
                 <DialogTitle className="text-xl">
                   {step === "config" ? "Carga Masiva (Excel)" : "Vista Previa de Importación"}
                 </DialogTitle>
                 <DialogDescription>
                    {step === "config" ? "Importa múltiples productos desde una hoja de cálculo." : "Revisa el estado de los productos antes de confirmar."}
                 </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {step === "config" ? (
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="file">Archivo Excel (.xlsx, .xls)</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Fila de inicio <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min={1}
                value={startRow}
                onChange={(e) => setStartRow(Number(e.target.value))}
                placeholder="2"
              />
              <p className="text-xs text-muted-foreground">Fila donde empiezan los datos (1=Encabezados)</p>
            </div>
            <div className="grid gap-2">
              <Label>Fila de fin (Opcional)</Label>
              <Input
                type="number"
                min={1}
                value={endRow}
                onChange={(e) => setEndRow(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Última fila"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="p-4 border-b">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    Columnas Obligatorias
                </h3>
            </div>
            <div className="p-4 grid grid-cols-3 gap-4">
               <div className="grid gap-2">
                 <Label>Código <span className="text-red-500">*</span></Label>
                 <Input value={colCode} onChange={e => setColCode(e.target.value)} placeholder="Ej: A" />
               </div>
               <div className="grid gap-2">
                 <Label>Descripción <span className="text-red-500">*</span></Label>
                 <Input value={colDescription} onChange={e => setColDescription(e.target.value)} placeholder="Ej: B" />
               </div>
               <div className="grid gap-2">
                 <Label>Precio <span className="text-red-500">*</span></Label>
                 <Input value={colPrice} onChange={e => setColPrice(e.target.value)} placeholder="Ej: C" />
               </div>
            </div>
          </div>

           <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
              <div className="p-4 border-b">
                 <h3 className="font-semibold text-sm">Columnas Opcionales</h3>
             </div>
             <div className="p-4 grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Cantidad (Stock)</Label>
                  <Input value={colAmount} onChange={e => setColAmount(e.target.value)} placeholder="Ej: D" />
                </div>
                <div className="grid gap-2">
                  <Label>Marca</Label>
                  <Input value={colBrand} onChange={e => setColBrand(e.target.value)} placeholder="Ej: E" />
                </div>
                <div className="grid gap-2">
                  <Label>Categoría</Label>
                  <Input value={colCategory} onChange={e => setColCategory(e.target.value)} placeholder="Ej: F" />
                </div>
                <div className="grid gap-2">
                  <Label>Subcategoría</Label>
                  <Input value={colSubCategory} onChange={e => setColSubCategory(e.target.value)} placeholder="Ej: G" />
                </div>
             </div>
           </div>

           <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
             <div className="p-4 border-b">
               <h3 className="font-semibold text-sm">Proveedor</h3>
             </div>
             <div className="p-4">
               <div className="flex gap-2 items-end">
                 <div className="flex-1 space-y-2">
                   <Label htmlFor="supplier">Seleccionar proveedor</Label>
                   <select
                     id="supplier"
                     value={selectedSupplierId}
                     onChange={(e) => handleSupplierSelect(e.target.value)}
                     className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                   >
                     <option value="">Sin proveedor</option>
                     {suppliers.map((s) => (
                       <option key={s.id} value={s.id}>{s.name}</option>
                     ))}
                   </select>
                 </div>
                 <CreateAttributeModal
                   type="supplier"
                   onSuccess={handleSupplierCreated}
                 />
               </div>
             </div>
           </div>

           <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
             <div className="p-4 border-b">
               <h3 className="font-semibold text-sm">Ajustes de Precio</h3>
             </div>
             <div className="p-4 grid grid-cols-3 gap-4">
               <div className="space-y-2">
                 <Label htmlFor="discount">Descuento %</Label>
                 <Input
                   id="discount"
                   type="number"
                   min={0}
                   max={100}
                   value={adjustmentDiscount}
                   onChange={(e) => setAdjustmentDiscount(Number(e.target.value))}
                 />
               </div>
               <div className="space-y-2">
                 <Label htmlFor="iva">IVA %</Label>
                 <select
                   id="iva"
                   value={adjustmentIva}
                   onChange={(e) => setAdjustmentIva(e.target.value)}
                   className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                 >
                   <option value="0">0%</option>
                   <option value="10.5">10.5%</option>
                   <option value="21">21%</option>
                 </select>
               </div>
               <div className="space-y-2">
                 <Label htmlFor="gain">Ganancia %</Label>
                 <Input
                   id="gain"
                   type="number"
                   min={0}
                   max={1000}
                   value={adjustmentGain}
                   onChange={(e) => setAdjustmentGain(Number(e.target.value))}
                 />
               </div>
             </div>
           </div>

           <div className="flex items-center gap-2">
             <input
               type="checkbox"
               id="updateExisting"
               checked={updateExisting}
               onChange={(e) => setUpdateExisting(e.target.checked)}
               className="h-4 w-4 rounded border-gray-300"
             />
             <Label htmlFor="updateExisting" className="text-sm font-normal cursor-pointer">
               Actualizar productos existentes si el código ya existe
             </Label>
           </div>

           <div className="flex items-center gap-2">
             <input
               type="checkbox"
               id="updateOnly"
               checked={updateOnly}
               onChange={(e) => setUpdateOnly(e.target.checked)}
               disabled={!updateExisting}
               className="h-4 w-4 rounded border-gray-300"
             />
             <Label htmlFor="updateOnly" className={`text-sm font-normal cursor-pointer ${!updateExisting ? 'text-muted-foreground' : ''}`}>
               Solo actualizar (no crear nuevos productos)
             </Label>
           </div>
           
           {errorMsg && (
             <div className="p-3 text-sm text-red-600 bg-red-100 rounded-md border border-red-200">
               {errorMsg}
             </div>
           )}
        </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="flex flex-wrap gap-4">
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Nuevos: {previewData?.createdCount}</Badge>
              <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">A Actualizar: {previewData?.updatedCount}</Badge>
              <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-200">Ignorados: {previewData?.ignoredCount}</Badge>
            </div>
            <div className="border rounded-md max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Precio Original</TableHead>
                    <TableHead>Precio Ajustado</TableHead>
                    <TableHead>Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData?.items.slice(0, 100).map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        {item.status === "create" && <Badge className="bg-blue-500 hover:bg-blue-600">Nuevo</Badge>}
                        {item.status === "update" && <Badge className="bg-yellow-500 hover:bg-yellow-600">Actualizar</Badge>}
                        {item.status === "ignore" && <Badge variant="outline">Ignorado</Badge>}
                      </TableCell>
                      <TableCell>{item.code}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>${item.price.toLocaleString("es-AR")}</TableCell>
                      <TableCell>
                        ${(() => {
                          const withDiscount = item.price * (1 - adjustmentDiscount / 100);
                          const withIva = withDiscount * (1 + parseFloat(adjustmentIva) / 100);
                          const withGain = withIva * (1 + adjustmentGain / 100);
                          return withGain.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        })()}
                      </TableCell>
                      <TableCell>{item.amount ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {previewData && previewData.items.length > 100 && (
              <p className="text-sm text-muted-foreground text-center">
                Mostrando los primeros 100 productos de {previewData.items.length}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "config" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handlePreview} disabled={loading || !file} className="bg-blue-600 hover:bg-blue-700 text-white">
                {loading ? "Calculando..." : "Siguiente"}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("config")} disabled={loading}>
                Volver
              </Button>
              <Button onClick={handleConfirm} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
                Confirmar Importación
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
