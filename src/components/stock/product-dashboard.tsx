"use client";

import { useEffect, useState } from "react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import Modal from "../Modal";
import { useRouter } from "next/navigation";
import { Session } from "next-auth";
import ProductDataTable from "../ProductDataTable";
import Product from "@/models/Product";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/config";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";

interface props {
  session: Session | null;
}

const ProductDashboad = ({ session }: props) => {
  const [openModal, setOpenModal] = useState(false);
  const [descriptionFilter, setDescriptionFilter] = useState("");

  const [products, setProducts] = useState<Product[]>();

  useEffect(() => {
    onSnapshot(collection(db, "stock"), (querySnapshot) => {
      const products = ProductFirebaseAdapter.fromDocumentDataArray(
        querySnapshot.docs
      );
      setProducts(products);
    });
  }, []);

  const router = useRouter();
  return session?.user ? (
    <div className="flex flex-col h-full w-full items-center">
      <Modal
        visible={openModal}
        onClose={() => setOpenModal(false)}
        blockButton={false}
        message={""}
        className="z-10 items-center my-auto"
      >
        <ProductForm onClose={() => setOpenModal(false)} />
      </Modal>
      <StockFilterPanel
        handleDescriptionFilter={(filter: string) =>
          setDescriptionFilter(filter)
        }
        handleOpenModal={() => setOpenModal(!openModal)}
      />
      {/* <StockTable session={session} descriptionFilter={descriptionFilter} /> */}
      <ProductDataTable
        descriptionFilter={descriptionFilter}
        products={products || []}
      />
    </div>
  ) : (
    <div className="h-screen text-center  items-center flex justify-center text-pink-400 mx-auto overflow-auto  sm:w-screen-sm mb-10">
      <div className="justify-center align-middle">
        <button
          className="p-2 px-3 align-middle justify-center my-auto hover:shadow-sm rounded-full hover:shadow-pink-300 bg-linear-to-r from-rose-200 to-pink-200 hover:text-white font-semibold"
          onClick={() => router.push("/login")}
        >
          Iniciar Sesion
        </button>
      </div>
    </div>
  );
};

export default ProductDashboad;
