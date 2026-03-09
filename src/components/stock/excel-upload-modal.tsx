"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createProductsBulk, BulkProductInput } from "@/actions/stock";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2 } from "lucide-react";

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

  const handleProcess = async () => {
    if (!file) {
      toast.error("Seleccione un archivo Excel primero");
      return;
    }

    if (!colCode || !colDescription || !colPrice) {
      toast.error("Debe especificar las columnas obligatorias: Código, Descripción y Precio");
      return;
    }

    setLoading(true);
    console.log("Iniciando procesamiento de archivo:", file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[sheetName];
      
      console.log("Leyendo hoja:", sheetName);
      
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
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
          amount: idxAmount >= 0 ? (typeof row[idxAmount] === 'number' ? row[idxAmount] : parseFloat(String(row[idxAmount]).replace(',', '.'))) || 100 : undefined,
          brandName: idxBrand >= 0 ? String(row[idxBrand] || "") : undefined,
          categoryName: idxCategory >= 0 ? String(row[idxCategory] || "") : undefined,
          subCategoryName: idxSubCategory >= 0 ? String(row[idxSubCategory] || "") : undefined,
        });
      }

      console.log("Productos parseados exitosamente:", parsedProducts.length);

      if (parsedProducts.length === 0) {
        toast.error("No se encontraron productos válidos en el rango de filas especificado. Verifique que las columnas seleccionadas tengan datos.");
        setLoading(false);
        return;
      }

      toast.loading(`Importando ${parsedProducts.length} productos...`, { id: "bulk-import" });
      
      const result = await createProductsBulk(parsedProducts);
      
      if (result.error) {
        toast.error(result.error, { id: "bulk-import" });
      } else {
        toast.success(result.success, { id: "bulk-import" });
        onSuccess();
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error detallado en procesamiento de Excel:", error);
      toast.error("Ocurrió un error al procesar el archivo. Revise la consola para más detalles.", { id: "bulk-import" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                <UploadCloud className="h-5 w-5" />
            </div>
            <div>
                 <DialogTitle className="text-xl">Carga Masiva (Excel)</DialogTitle>
                 <DialogDescription>
                    Importa múltiples productos desde una hoja de cálculo.
                 </DialogDescription>
            </div>
          </div>
        </DialogHeader>

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleProcess} disabled={loading || !file} className="bg-green-600 hover:bg-green-700 text-white">
            {loading ? "Procesando..." : "Importar Datos"}
            <CheckCircle2 className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
