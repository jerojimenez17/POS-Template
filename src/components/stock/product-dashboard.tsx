"use client";

import { useEffect, useState } from "react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import Modal from "../Modal";
import { Session } from "next-auth";
import ProductDataTable from "../ProductDataTable";
import Product from "@/models/Product";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/config";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";

interface props {
  session: Session | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  return (
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
  );
};

export default ProductDashboad;
