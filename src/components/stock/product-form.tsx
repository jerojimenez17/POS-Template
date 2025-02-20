"use client";

import { ProductSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect, useState, useTransition } from "react";
import { z } from "zod";
import { newProduct } from "../actions/newProduct"; // Importa la función de edición
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
import { db, storage } from "@/firebase/config";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import { FormSuccess } from "../ui/form-success";
import { v4 } from "uuid";
import { FormError } from "../ui/form-error";
import Product from "@/models/Product";
import NewCategoryModal from "./new-category-modal";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import NewSubcategoryModal from "./new-subcategory-modal";
import NewBrandModal from "./new-brand-modal";
import { editProduct } from "@/firebase/stock/editProduct";
import NewSuplierModal from "./new-suplier-modal";
import { Suplier } from "@/models/Suplier";
import { SuplierFirebaseAdapter } from "@/models/SuplierFirebaseAdapter";

interface props {
  product?: Product;
  onClose: () => void;
}

const ProductForm = ({ product, onClose }: props) => {
  const [isPending, startTransition] = useTransition();
  const [uploadMessages, setUploadMessage] = useState<string[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [supliers, setSupliers] = useState<Suplier[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [image, setImage] = useState<File | null>(null);

  // Inicializa el formulario con los valores predeterminados basados en el producto existente o en blanco
  const form = useForm<z.infer<typeof ProductSchema>>({
    resolver: zodResolver(ProductSchema),
    defaultValues: {
      suplier: product?.suplier.id || "",
      code: product?.code || "",
      description: product?.description || "",
      price: product?.price || 0,
      id: product?.id || "",
      unit: product?.unit || "",
      amount: product?.amount || 0,
      brand: product?.brand || "",
      category: product?.category || "",
      image: product?.image || "",
      imageName: product?.imageName || "",
      client_bonus: product?.client_bonus || 0,
      subCategory: product?.subCategory || "",
      gain: product?.gain || 0.0,
      last_update: product?.last_update || new Date(),
      salePrice: product?.salePrice || 0,
    },
  });

  useEffect(() => {
    if (product) {
      form.reset({
        suplier: product.suplier.id || "",
        code: product.code || "",
        description: product.description || "",
        price: product.price || 0,
        id: product.id || "",
        unit: product.unit || "",
        amount: product.amount || 0,
        brand: product.brand || "",
        category: product.category || "",
        image: product.image || "",
        imageName: product.imageName || "",
        client_bonus: product.client_bonus || 0,
        subCategory: product.subCategory || "",
        gain: product.gain || 0.0,
        last_update: product.last_update || new Date(),
        salePrice: product.salePrice || 0,
      });
    }
  }, [product, form]);

  const onSubmit = async (values: z.infer<typeof ProductSchema>) => {
    startTransition(async () => {
      try {
        let imageURL = product?.image || "";
        let imageName = product?.imageName || "";

        // Si hay una nueva imagen, se carga y se actualiza la URL
        if (image) {
          imageName = `${image.name}_${v4()}`;
          const storageRef = ref(storage, `/productImage/${imageName}`);
          await uploadBytes(storageRef, image);
          imageURL = await getDownloadURL(storageRef);

          // Eliminar la imagen anterior si se cambió la imagen
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
              console.warn(
                "La imagen anterior no se pudo encontrar o eliminar."
              );
            });
          }

          values.image = imageURL;
          values.imageName = imageName;
        }

        if (product) {
          // Modo de edición: Actualiza el producto

          const docData = await getDoc(
            doc(db, "supliers", values.suplier || "")
          );
          if (docData.exists()) {
            const newSuplier = SuplierFirebaseAdapter.fromDocumentData(
              docData.data(),
              docData.id
            );
            console.log(newSuplier);
            await editProduct(product.id, {
              ...values,
              suplier: newSuplier || undefined,
              image: imageURL,
              last_update: new Date(),
              creation_date: product.creation_date,
              imageName,
            });
          }
          setUploadMessage(["Producto editado con éxito"]);
        } else {
          // Modo de creación: Crea un nuevo producto
          console.log("Entro" + { ...values });
          const { error } = await newProduct(values);
          if (error) {
            const newErrors = errorMessages;
            newErrors.push(error.toString());
            setErrorMessages(newErrors);
          }
          setUploadMessage(["Producto cargado con éxito"]);
        }

        form.reset();
        onClose(); // Cerrar el modal o hacer cualquier acción posterior
      } catch (error) {
        console.error(error);
        if (error instanceof Error) {
          setErrorMessages([error.message]);
        } else {
          setErrorMessages(["Ha ocurrido un error desconocido"]);
        }
      }
    });
  };

  useEffect(() => {
    const collectionRef = collection(db, "categories");

    onSnapshot(collectionRef, (querySnapshot) => {
      const categories: string[] = [];
      querySnapshot.docs.forEach((snapshot) => {
        categories.push(snapshot.data().name);
      });
      setCategories(categories);
    });
    const collectionSuplierRef = collection(db, "supliers");

    onSnapshot(collectionSuplierRef, (querySnapshot) => {
      const newSupliers = SuplierFirebaseAdapter.fromDocumentDataArray(
        querySnapshot.docs
      );
      setSupliers(newSupliers);
    });

    const collectionSubRef = collection(db, "subcategories");

    onSnapshot(collectionSubRef, (querySnapshot) => {
      const subcategories: string[] = [];
      querySnapshot.docs.forEach((snapshot) => {
        subcategories.push(snapshot.data().name);
      });
      setSubcategories(subcategories);
    });

    const collectionBrandRef = collection(db, "brands");

    onSnapshot(collectionBrandRef, (querySnapshot) => {
      const brands: string[] = [];
      querySnapshot.docs.forEach((snapshot) => {
        brands.push(snapshot.data().name);
      });
      setBrands(brands);
    });
  }, []);

  const fileRef = form.register("image");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-2 bg-opacity-10"
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="image"
            render={({}) => (
              <FormItem>
                <FormLabel>Foto</FormLabel>
                <FormControl>
                  <Input
                    className="border-black"
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
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Codigo</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder=""
                    type="text"
                    className="border-black"
                    autoComplete="cod"
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descripcion</FormLabel>
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
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Precio</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isPending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-4 flex w-full">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Categoria</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {categories
                      .filter((category) => {
                        return category !== "";
                      })
                      .map((category) => (
                        <SelectItem
                          key={category + Math.random().toString()}
                          value={category}
                        >
                          {category}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col justify-end">
            <NewCategoryModal />
          </div>
        </div>
        <div className="space-y-4 flex w-full">
          <FormField
            control={form.control}
            name="subCategory"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Sub-Categoria</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Sub-Categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {subcategories
                      .filter((category) => {
                        return category !== "";
                      })
                      .map((category) => (
                        <SelectItem
                          key={category + Math.random().toString()}
                          value={category}
                        >
                          {category}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col justify-end">
            <NewSubcategoryModal />
          </div>
        </div>
        <div className="space-y-4 flex w-full">
          <FormField
            control={form.control}
            name="brand"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Marca</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Marca" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {brands
                      .filter((category) => {
                        return category !== "";
                      })
                      .map((category) => (
                        <SelectItem
                          key={category + Math.random().toString()}
                          value={category}
                        >
                          {category}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col justify-end">
            <NewBrandModal />
          </div>
        </div>
        <div className="space-y-4 flex w-full">
          <FormField
            control={form.control}
            name="suplier"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Proveedor</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="border border-black">
                      <SelectValue placeholder="Selecciona Proveedor">
                        {" "}
                        {supliers.find((suplier) => suplier.id === field.value)
                          ?.name || "Selecciona Proveedor"}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="text-black bg-white">
                    {supliers
                      .filter((suplier) => {
                        return suplier.name !== "";
                      })
                      .map((suplier) => (
                        <SelectItem
                          key={suplier + Math.random().toString()}
                          value={suplier.id}
                        >
                          {suplier.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col justify-end">
            <NewSuplierModal />
          </div>
        </div>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="gain"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Margen de utilidad</FormLabel>
                <FormControl>
                  <Input
                    className="border border-black"
                    {...field}
                    disabled={isPending}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
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
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="space-y-4 border-black text-black">
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
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
                <FormLabel>Cantidad</FormLabel>
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
        <Button type="submit" disabled={isPending} className="w-full">
          {product ? "Guardar Cambios" : "+Agregar Producto"}
        </Button>
      </form>
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
