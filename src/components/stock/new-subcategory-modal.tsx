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
import { addSubcategory } from "@/firebase/stock/newSubCategory";

const NewSubcategoryModal = () => {
  const [subcategory, setSubcategory] = useState("");
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
          <DialogTitle>Nueva Categoria</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Sub-Categoria
            </Label>
            <Input
              id="subcategory"
              value={subcategory}
              placeholder="Nueva subcategoria"
              onChange={(e) => {
                setSubcategory(e.currentTarget.value);
              }}
              className="col-span-3 text-gray-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (subcategory !== "") {
                await addSubcategory(subcategory);
                setSuccess(true);
              }
              setSubcategory("");
            }}
            type="submit"
          >
            Agregar
          </Button>
          {success && <FormSuccess message="Subcategoria creada" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSubcategoryModal;
