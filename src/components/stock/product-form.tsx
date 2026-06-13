"use client";

import { ProductSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useRef, useState, useTransition } from "react";
import { z } from "zod";
import { newProduct } from "../actions/newProduct";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { FormSuccess } from "../ui/form-success";
import { FormError } from "../ui/form-error";
import CreateAttributeModal from "./create-attribute-modal";
import { ScanBarcode, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import Image from "next/image";
import { getCategories } from "@/actions/categories";

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-64 bg-black flex items-center justify-center text-white">
        Cargando escáner...
      </div>
    ),
  },
);
import { getBrands } from "@/actions/brands";
import { getSubcategories } from "@/actions/subcategories";
import { getSuppliers, updateProduct } from "@/actions/stock";

import {
  Product,
  Supplier,
  Brand,
  Category,
  Subcategory,
} from "@prisma/client";

export type ProductExtended = Product & {
  supplier?: Supplier | null;
  brand?: Brand | null;
  category?: Category | null;
  subCategory?: Subcategory | null;
};

interface Props {
  product?: ProductExtended;
  onClose: () => void;
}

const ProductForm = ({ product, onClose }: Props) => {
  const [isPending, startTransition] = useTransition();
  const [uploadMessages, setUploadMessages] = useState<string[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [subcategories, setSubcategories] = useState<
    { id: string; name: string }[]
  >([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<{ id: string; url: string }[]>([]);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);

  const getInitialValues = (prod?: ProductExtended) => ({
    supplier: prod?.supplierId || prod?.supplier?.id || "",
    code: prod?.code || "",
    description: prod?.description || "",
    price: prod?.price || 0,
    id: prod?.id || "",
    unit: prod?.unit || "",
    amount: prod?.amount || 0,
    brand: prod?.brandId || prod?.brand?.id || "",
    category: prod?.categoryId || prod?.category?.id || "",
    image: prod?.image || "",
    imageName: prod?.imageName || "",
    client_bonus: prod?.client_bonus || 0,
    subCategory: prod?.subCategoryId || prod?.subCategory?.id || "",
    gain: prod?.gain || 0.0,
    last_update: prod ? new Date(prod.last_update) : new Date(),
    salePrice: prod?.salePrice || 0,
    catalog: prod?.catalog ?? true,
    details: prod?.details || "",
  });

  const form = useForm<z.infer<typeof ProductSchema>>({
    resolver: zodResolver(ProductSchema),
    defaultValues: getInitialValues(product),
  });

  useEffect(() => {
    if (product) {
      form.reset(getInitialValues(product));
    }
  }, [product, form]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fetchedCategories = await getCategories();
        if (mounted) {
          setCategories(
            fetchedCategories.map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            })),
          );
        }

        const fetchedBrands = await getBrands();
        if (mounted) {
          setBrands(
            fetchedBrands.map((b: { id: string; name: string }) => ({
              id: b.id,
              name: b.name,
            })),
          );
        }

        const fetchedSuppliers = await getSuppliers();
        if (mounted) {
          setSuppliers(
            fetchedSuppliers.map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name,
            })),
          );
        }
      } catch (e) {
        console.error("Error cargando datos del formulario:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedCategoryId = form.watch("category");
  const prevCategoryIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    let mounted = true;

    // Si cambia la categoría, limpiamos subcategoría para evitar valores inválidos.
    if (
      prevCategoryIdRef.current !== undefined &&
      prevCategoryIdRef.current !== selectedCategoryId
    ) {
      form.setValue("subCategory", "");
    }
    prevCategoryIdRef.current = selectedCategoryId || "";

    (async () => {
      try {
        if (selectedCategoryId) {
          const fetchedSubs = await getSubcategories(selectedCategoryId);
          if (mounted) {
            setSubcategories(
              fetchedSubs.map((s: { id: string; name: string }) => ({
                id: s.id,
                name: s.name,
              })),
            );
          }
        } else if (mounted) {
          setSubcategories([]);
        }
      } catch (e) {
        console.error("Error cargando subcategorías:", e);
        if (mounted) setSubcategories([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedCategoryId, form]);

  useEffect(() => {
    if (product) {
      setExistingImages(
        (product as unknown as { images?: { id: string; url: string }[] }).images ?? []
      );
    }
  }, [product]);

  const handleCategorySuccess = (item: { id: string; name: string }) => {
    setCategories((prev) =>
      [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
    );
    form.setValue("category", item.id);
  };

  const handleSubcategorySuccess = (item: { id: string; name: string }) => {
    setSubcategories((prev) =>
      [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
    );
    form.setValue("subCategory", item.id);
  };

  const handleBrandSuccess = (item: { id: string; name: string }) => {
    setBrands((prev) =>
      [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
    );
    form.setValue("brand", item.id);
  };

  const handleSupplierSuccess = (item: { id: string; name: string }) => {
    setSuppliers((prev) =>
      [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
    );
    form.setValue("supplier", item.id);
  };

  const onSubmit = async (values: z.infer<typeof ProductSchema>) => {
    startTransition(async () => {
      try {
        if (product) {
          // Relational mapping for updateProduct
          const updateData = {
            ...values,
            brandId: values.brand,
            categoryId: values.category,
            subCategoryId: values.subCategory,
            supplierId: values.supplier,
            newImages: newImages.length > 0 ? newImages : undefined,
            imagesToDelete: imagesToDelete.length > 0 ? imagesToDelete : undefined,
          };

          const result = await updateProduct(product.id, updateData);
          if (result.error) {
            toast.error(result.error);
            setErrorMessages([result.error]);
          } else {
            toast.success("Producto actualizado con éxito");
            setTimeout(() => onClose(), 800);
          }
        } else {
          // Ensure image and imageName are strings for the server action
          const submissionValues = {
            ...values,
            image: typeof values.image === "string" ? values.image : "",
            imageName:
              typeof values.imageName === "string" ? values.imageName : "",
            newImages: newImages.length > 0 ? newImages : undefined,
          };
          const result = await newProduct(submissionValues);
          if (result.error) {
            toast.error(result.error);
            setErrorMessages([result.error]);
          } else {
            setUploadMessages(["Producto cargado con éxito"]);
            toast.success("Producto cargado con éxito");
            form.reset();
            setTimeout(() => onClose(), 800);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error("Ha ocurrido un error inesperado");
      }
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      >
        <div className="col-span-1 md:col-span-2 space-y-2">
          <FormField
            control={form.control}
            name="image"
            render={({}) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Fotos del producto
                </FormLabel>
                <FormControl>
                  <div className="space-y-3">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = e.currentTarget.files;
                          if (files) {
                            setNewImages((prev) => [
                              ...prev,
                              ...Array.from(files),
                            ]);
                          }
                        }}
                        disabled={isPending}
                      />
                      <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-gray-50 dark:bg-gray-800">
                        <div className="text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click para agregar fotos
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            PNG, JPG hasta 5MB
                          </p>
                        </div>
                      </div>
                    </label>
                    {existingImages.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {existingImages.map((img) => {
                          const markedForDeletion = imagesToDelete.includes(img.id);
                          return (
                            <div
                              key={img.id}
                              className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 ${markedForDeletion ? "border-red-500 opacity-50" : "border-gray-200"}`}
                            >
                              <Image
                                src={img.url}
                                alt=""
                                fill
                                sizes="80px"
                                className="object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (markedForDeletion) {
                                    setImagesToDelete((prev) =>
                                      prev.filter((id) => id !== img.id)
                                    );
                                  } else {
                                    setImagesToDelete((prev) => [...prev, img.id]);
                                  }
                                }}
                                className="absolute top-0.5 right-0.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow"
                              >
                                {markedForDeletion ? (
                                  <RotateCcw className="w-3 h-3" />
                                ) : (
                                  <X className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {newImages.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          Nuevas fotos a subir
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {newImages.map((file, i) => (
                            <div
                              key={`new-${i}`}
                              className="relative w-20 h-20 rounded-lg overflow-hidden border-2 border-green-300"
                            >
                              <img
                                src={URL.createObjectURL(file)}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setNewImages((prev) => prev.filter((_, idx) => idx !== i))
                                }
                                className="absolute top-0.5 right-0.5 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Codigo <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      {...field}
                      placeholder=""
                      type="text"
                      className="border-black"
                      autoComplete="code"
                      disabled={isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setScannerOpen(true)}
                      className="h-10 w-10 border-black text-gray-500 hover:text-black"
                      title="Escanear código de barras"
                    >
                      <ScanBarcode className="h-5 w-5" />
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Descripción <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Nombre del producto"
                    type="text"
                    autoComplete="description"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Precio de costo <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <Input
                      {...field}
                      disabled={isPending}
                      type="number"
                      step="0.01"
                      className="pl-7"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="gain"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Margen de ganancia % <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      disabled={isPending}
                      type="number"
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      %
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>
                  Categoria <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona Categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1.5">
            <CreateAttributeModal
              type="category"
              onSuccess={handleCategorySuccess}
            />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="subCategory"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Subcategoría</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!selectedCategoryId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1.5">
            <CreateAttributeModal
              type="subcategory"
              parentId={selectedCategoryId}
              onSuccess={handleSubcategorySuccess}
            />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>
                  Marca <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1.5">
            <CreateAttributeModal type="brand" onSuccess={handleBrandSuccess} />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Proveedor</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-1.5">
            <CreateAttributeModal
              type="supplier"
              onSuccess={handleSupplierSuccess}
            />
          </div>
        </div>

        <div className="space-y-2">
          <FormField
            control={form.control}
            name="client_bonus"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Bonificación a cliente
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      disabled={isPending}
                      type="number"
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                      %
                    </span>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Unidad <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Unidad">Unidad</SelectItem>
                    <SelectItem value="Kg">Kg</SelectItem>
                    <SelectItem value="Gr">Gramo</SelectItem>
                    <SelectItem value="Lt">Litro</SelectItem>
                    <SelectItem value="Mt">Metro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Cantidad inicial <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input type="number" {...field} disabled={isPending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-2 space-y-2">
          <FormField
            control={form.control}
            name="details"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  Detalles del producto
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Descripción detallada para el catálogo (opcional)"
                    disabled={isPending}
                    className="resize-none h-24"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-2">
          <FormField
            control={form.control}
            name="catalog"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm font-medium">
                    Visible en catálogo
                  </FormLabel>
                  <p className="text-xs text-muted-foreground">
                    {field.value
                      ? "El producto se mostrará en el catálogo público"
                      : "El producto está oculto del catálogo público"}
                  </p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    disabled={isPending}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="col-span-1 md:col-span-2 mt-2">
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-11 text-base font-medium bg-black dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Guardando...
              </span>
            ) : product ? (
              "Guardar cambios"
            ) : (
              "Agregar producto"
            )}
          </Button>
        </div>
      </form>

      {/* Scanner Modal Overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
          <Button
            variant="ghost"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full h-12 w-12 p-0"
            onClick={() => setScannerOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h3 className="text-white text-xl font-semibold">
                Escanear código
              </h3>
              <p className="text-gray-400 text-sm mt-1">
                Apuntá la cámara al código de barras
              </p>
            </div>

            <div className="aspect-square bg-black rounded-2xl overflow-hidden relative border-2 border-white/20 shadow-2xl">
              <Scanner
                formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
                onScan={(result) => {
                  if (result && result.length > 0) {
                    const rawValue = result[0].rawValue;
                    form.setValue("code", rawValue);
                    setScannerOpen(false);
                    toast.success(`Código escaneado: ${rawValue}`);
                  }
                }}
              />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-56 h-32 border-2 border-green-400/70 rounded-lg"></div>
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400/30"></div>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => setScannerOpen(false)}
                className="bg-transparent text-white border-white/30 hover:bg-white/10"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {uploadMessages.map((message) => (
        <FormSuccess key={message} message={message} />
      ))}
      {errorMessages.map((message) => (
        <FormError key={message} message={message} />
      ))}
    </Form>
  );
};

export default ProductForm;
