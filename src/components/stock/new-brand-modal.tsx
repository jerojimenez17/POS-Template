"use client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useState } from "react";
import { FormSuccess } from "../ui/form-success";
import { addBrand } from "@/firebase/stock/newBrand";

const NewCategoryModal = () => {
  const [brand, setBrand] = useState("");
  const [success, setSuccess] = useState(false);
  return (
    <Dialog>
      <DialogTrigger
        asChild
        className="h-9 ml-1 bg-black text-white font-semibold hover:text-gray-800"
      >
        <Button variant="outline">+ Nueva</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Marca</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Categoria
            </Label>
            <Input
              id="brand"
              value={brand}
              placeholder="Marca"
              onChange={(e) => {
                if (e.currentTarget.value !== "") {
                  setBrand(e.currentTarget.value);
                }
              }}
              className="col-span-3 border-black text-gray-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (brand !== "") {
                await addBrand(brand);
                setSuccess(true);
              }
              setBrand("");
            }}
            type="submit"
          >
            Agregar
          </Button>
          {success && <FormSuccess message="Marca agregada!" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCategoryModal;
