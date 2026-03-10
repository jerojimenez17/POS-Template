"use client";

import { ProductSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState, useTransition } from "react";
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

  const fetchData = async () => {
    const fetchedCategories = await getCategories();
    setCategories(fetchedCategories.map((c: { id: string; name: string; }) => ({ id: c.id, name: c.name })));

    const fetchedBrands = await getBrands();
    setBrands(fetchedBrands.map((b: { id: string; name: string; }) => ({ id: b.id, name: b.name })));

    const fetchedSuppliers = await getSuppliers();
    setSuppliers(fetchedSuppliers.map((s: { id: string; name: string; }) => ({ id: s.id, name: s.name })));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedCategoryId = form.watch("category");
  useEffect(() => {
    const fetchSubs = async () => {
      if (selectedCategoryId) {
        const fetchedSubs = await getSubcategories(selectedCategoryId);
        setSubcategories(fetchedSubs.map((s: { id: string; name: string; }) => ({ id: s.id, name: s.name })));
      } else {
        setSubcategories([]);
      }
    };
    fetchSubs();
  }, [selectedCategoryId]);

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
            setUploadMessage(["Producto cargado con éxito"]);
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

  const fileRef = form.register("image");

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
                <FormLabel>Foto</FormLabel>
                <FormControl>
                  <Input
                    className="border-black file:text-black"
                    {...fileRef}
                    onChange={(e) => {
                      if (e.currentTarget.files) {
                        setImage(e.currentTarget.files[0]);
                      }
                    }}
                    placeholder=""
                    type="file"
                    autoComplete="image"
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
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codigo <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder=""
                    type="text"
                    className="border-black"
                    autoComplete="code"
                    disabled={isPending}
                  />
                </FormControl>
                <div className="absolute right-2 top-8 flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setScannerOpen(true)}
                    className="h-8 w-8 text-gray-500 hover:text-black"
                    title="Escanear código de barras"
                  >
                    <ScanBarcode className="h-5 w-5" />
                  </Button>
                </div>
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
                <FormLabel>Descripcion <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder=""
                    type="text"
                    className="border-black"
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
                <FormLabel>Precio <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input {...field} disabled={isPending} type="number" step="0.01" />
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
                <FormLabel>Margen de utilidad <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input
                    className="border border-black"
                    {...field}
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2 flex items-end gap-2">
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
        <div className="space-y-2 flex items-end gap-2">
          <FormField
            control={form.control}
            name="subCategory"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Sub-Categoria <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={!selectedCategoryId}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Sub-Categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
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
          <div className="pb-1">
            <NewSubcategoryModal categoryId={selectedCategoryId} />
          </div>
        </div>
        <div className="space-y-2 flex items-end gap-2">
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Marca <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Marca" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {brands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.id}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NewBrandModal />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="supplier"
          render={({ field }) => (
            <FormItem className="w-full">
              <FormLabel>Proveedor</FormLabel>
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Proveedor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <NewSuplierModal />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormField
            control={form.control}
            name="client_bonus"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bonificacion a cliente</FormLabel>
                <FormControl>
                  <Input
                    className="border border-black"
                    {...field}
                    disabled={isPending}
                    type="number"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-2 border-black text-black">
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad <span className="text-red-500">*</span></FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona la unidad de medida" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Unidad">Unidad</SelectItem>
                    <SelectItem value="Kg">Kg</SelectItem>
                    <SelectItem value="Gr">Gr</SelectItem>
                    <SelectItem value="Lt">Lt</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cantidad <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <Input
                    className="border border-black"
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
        <Button type="submit" disabled={isPending} className="col-span-1 md:col-span-2 w-full mt-4">
          {product ? "Guardar Cambios" : "+Agregar Producto"}
        </Button>
      </form>

      {/* Scanner Modal Overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <Button
            variant="ghost"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full h-10 w-10 p-0"
            onClick={() => setScannerOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>
          
          <div className="w-full max-w-md aspect-square bg-black rounded-2xl overflow-hidden relative border border-white/20 shadow-2xl">
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
            <div className="absolute inset-0 border-2 border-white/30 pointer-events-none rounded-2xl">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white/50 rounded-lg"></div>
            </div>
          </div>
          <p className="text-white mt-4 text-center font-medium">Apunta la cámara al código de barras</p>
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
