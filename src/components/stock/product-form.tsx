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
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { storage } from "@/firebase/config";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import { FormSuccess } from "../ui/form-success";
import { v4 } from "uuid";
import { FormError } from "../ui/form-error";
import NewCategoryModal from "./new-category-modal";
import NewSubcategoryModal from "./new-subcategory-modal";
import NewBrandModal from "./new-brand-modal";
import NewSuplierModal from "./new-suplier-modal";
import { Scanner } from "@yudiel/react-qr-scanner";
import { toast, Toaster } from "sonner";
import { ScanBarcode, X } from "lucide-react";
import { getCategories } from "@/actions/categories";
import { getBrands } from "@/actions/brands";
import { getSubcategories } from "@/actions/subcategories";
import { getSuppliers, updateProduct } from "@/actions/stock";

import { Product, Supplier, Brand, Category, Subcategory } from "@prisma/client";

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
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<{id: string, name: string}[]>([]);
  const [subcategories, setSubcategories] = useState<{id: string, name: string}[]>([]);
  const [brands, setBrands] = useState<{id: string, name: string}[]>([]);
  const [image, setImage] = useState<File | null>(null);

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
            }))
          );
        }

        const fetchedBrands = await getBrands();
        if (mounted) {
          setBrands(
            fetchedBrands.map((b: { id: string; name: string }) => ({
              id: b.id,
              name: b.name,
            }))
          );
        }

        const fetchedSuppliers = await getSuppliers();
        if (mounted) {
          setSuppliers(
            fetchedSuppliers.map((s: { id: string; name: string }) => ({
              id: s.id,
              name: s.name,
            }))
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
    if (prevCategoryIdRef.current !== undefined && prevCategoryIdRef.current !== selectedCategoryId) {
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
              }))
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

  const onSubmit = async (values: z.infer<typeof ProductSchema>) => {
    startTransition(async () => {
      try {
        let imageURL = product?.image || "";
        let imageName = product?.imageName || "";

        if (image) {
          imageName = `${image.name}_${v4()}`;
          const storageRef = ref(storage, `/productImage/${imageName}`);
          await uploadBytes(storageRef, image);
          imageURL = await getDownloadURL(storageRef);

          if (
            product?.image &&
            product.imageName &&
            imageURL !== product.image
          ) {
            const oldImageRef = ref(
              storage,
              `/productImage/${product.imageName}`
            );
            await deleteObject(oldImageRef).catch(() => {
              toast.error("La imagen anterior no se pudo eliminar.");
            });
          }

          values.image = imageURL;
          values.imageName = imageName;
        }

        if (product) {
          // Relational mapping for updateProduct
          const updateData = {
            ...values,
            brandId: values.brand,
            categoryId: values.category,
            subCategoryId: values.subCategory,
            supplierId: values.supplier,
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
            imageName: typeof values.imageName === "string" ? values.imageName : "",
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
      <Toaster position="top-left" duration={3000} richColors />
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
                <FormLabel className="text-sm font-medium">Foto del producto</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          if (e.currentTarget.files?.[0]) {
                            setImage(e.currentTarget.files[0]);
                          }
                        }}
                        disabled={isPending}
                      />
                      <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-gray-50 dark:bg-gray-800">
                        <div className="text-center">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click para subir imagen
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            PNG, JPG hasta 5MB
                          </p>
                        </div>
                      </div>
                    </label>
                    {image && (
                      <div className="text-sm text-green-600 dark:text-green-400">
                        ✓ Imagen seleccionada
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
                <FormLabel>Codigo <span className="text-red-500">*</span></FormLabel>
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
                <FormLabel className="text-sm font-medium">Descripción <span className="text-red-500">*</span></FormLabel>
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
                <FormLabel className="text-sm font-medium">Precio de costo <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <Input {...field} disabled={isPending} type="number" step="0.01" className="pl-7" />
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
                <FormLabel className="text-sm font-medium">Margen de ganancia % <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      disabled={isPending}
                      type="number"
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
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
              <FormItem className="w-full">
                <FormLabel>Categoria <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
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
          <div className="pb-1">
            <NewCategoryModal />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="subCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Subcategoría</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!selectedCategoryId}
                >
                  <FormControl>
                    <SelectTrigger className="h-9">
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
          <div className="pt-6">
            <NewSubcategoryModal categoryId={selectedCategoryId} />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Marca <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="h-9">
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
          <div className="pt-6">
            <NewBrandModal />
          </div>
        </div>
        <div className="flex flex-row items-end gap-2">
          <FormField
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Proveedor</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="h-9">
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
          <div className="pt-6">
            <NewSuplierModal />
          </div>
        </div>

        <div className="space-y-2">
          <FormField
            control={form.control}
            name="client_bonus"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Bonificación a cliente</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      {...field}
                      disabled={isPending}
                      type="number"
                      className="pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
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
                <FormLabel className="text-sm font-medium">Unidad <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
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
                <FormLabel className="text-sm font-medium">Cantidad inicial <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
              <h3 className="text-white text-xl font-semibold">Escanear código</h3>
              <p className="text-gray-400 text-sm mt-1">Apuntá la cámara al código de barras</p>
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
