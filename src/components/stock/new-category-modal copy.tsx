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
import { addCategoy } from "@/firebase/stock/newCategory";
import { useState } from "react";
import { FormSuccess } from "../ui/form-success";

const NewCategoryModal = () => {
  const [category, setCategory] = useState("");
  const [success, setSuccess] = useState(false);
  return (
    <Dialog>
      <DialogTrigger
        asChild
        className="h-9 ml-1 bg-blue-200 font-semibold hover:text-gray-500"
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
              Categoria
            </Label>
            <Input
              id="category"
              defaultValue="Pedro Duarte"
              onChange={(e) => {
                setCategory(e.currentTarget.value);
              }}
              className="col-span-3 text-gray-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (category !== "") {
                await addCategoy(category);
                if (category !== "") {
                  setSuccess(true);
                }
                setCategory("");
              }
            }}
            type="submit"
          >
            Agregar
          </Button>
          {success && <FormSuccess />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCategoryModal;
