"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase/config";
import moment from "moment";
import Account, { ProductAccount } from "@/models/Account";
import { Button } from "@/components/ui/button";
import Spinner from "@/components/ui/Spinner";
import PlusButton from "@/components/ui/PlusButton";
import LessButton from "@/components/ui/LessButton";
import DeleteButton from "@/components/DeleteButton";

const Page = () => {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);

  useEffect(() => {
    const fetchAccount = async () => {
      if (!id) return;

      const docRef = doc(db, "accountLedger", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const productsAccount = snap
          .data()
          .productsAccount.map((productAccount: ProductAccount) => {
            return new ProductAccount(
              productAccount,
              productAccount.amount,
              moment(productAccount.date.toDate())
            );
          });
        const data = snap.data();
        const loadedAccount = new Account(
          snap.id,
          data.clientName,
          data.clientEmail,
          data.clientPhone,
          productsAccount || [],
          moment(data.date.toDate()),
          moment(data.last_update.toDate()),
          data.status
        );
        setAccount(loadedAccount);
      }

      setLoadingAccount(false);
    };

    fetchAccount();
  }, [id]);

  const handleMarkAsPaid = async () => {
    if (!account) return;
    setLoading(true);
    const docRef = doc(db, "accountLedger", account.id);
    const document = await getDoc(docRef);

    if (document.exists() && document.data().status === "pending") {
      await updateDoc(docRef, {
        status: "paid",
        last_update: new Date(),
      });
      setAccount({ ...account, status: "paid" });
    } else {
      if (document.exists()) {
        await updateDoc(docRef, {
          status: "pending",
          last_update: new Date(),
        });
        setAccount({ ...account, status: "pending" });
      }
    }
    setLoading(false);
  };
  const handleChangeUnit = async (productId: string, amount: number) => {
    setLoading(true);
    if (id === undefined) return;
    const docRef = doc(db, "accountLedger", id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const productsAccount = snap
      .data()
      .productsAccount.map((productAccount: ProductAccount) => {
        return new ProductAccount(
          productAccount,
          productId === productAccount.id
            ? productAccount.amount + amount
            : productAccount.amount,
          moment(productAccount.date.toDate())
        );
      });
    const serializedProducts = productsAccount.map((p: ProductAccount) => ({
      ...p,
      date: p.date instanceof Date ? p.date : new Date(p.date.toDate()),
    }));

    updateDoc(docRef, {
      productsAccount: serializedProducts,
      last_update: new Date(),
    });

    if (account) {
      setAccount({
        ...account,
        productsAccount: productsAccount,
        total: productsAccount.reduce(
          (acc: number, p: { salePrice: number; amount: number }) =>
            acc + p.salePrice * p.amount,
          0
        ),
        last_update: moment(),
      });
    }
    setLoading(false);
  };
  const handleDeleteProduct = async (product: ProductAccount) => {
    if (!account) return;
    setLoading(true);
    const updatedProducts = account.productsAccount.filter(
      (pa) => !(pa.id === product.id && pa.date === product.date)
    );

    const newTotal = updatedProducts.reduce(
      (acc, p) => acc + p.salePrice * p.amount,
      0
    );

    const serializedProducts = updatedProducts.map((p) => ({
      ...p,
      date: p.date instanceof Date ? p.date : new Date(p.date.toDate()),
    }));

    const docRef = doc(db, "accountLedger", account.id);
    await updateDoc(docRef, {
      productsAccount: serializedProducts,
      total: newTotal,
      last_update: new Date(),
    });

    setAccount({
      ...account,
      productsAccount: updatedProducts,
      total: newTotal,
      last_update: moment(),
    });
    setLoading(false);
  };

  if (loadingAccount) return <Spinner />;
  if (!account) return <div className="p-4">Cuenta no encontrada</div>;
  return (
    <>
      {loading && <Spinner />}
      <div className="p-4 h-full flex flex-col overflow-auto py-14 space-y-4">
        <h1 className="text-xl text-center dark:text-gray-100 font-bold">
          Cuenta
        </h1>
        <div className="border rounded-lg p-4 dark:bg-gray-700 dark:text-gray-100 shadow">
          <p>
            <strong>Cliente:</strong> {account.clientName}
          </p>
          <p>
            <strong>Email:</strong> {account.clientEmail}
          </p>
          <p>
            <strong>Teléfono:</strong> {account.clientPhone}
          </p>
          <p>
            <strong>Total:</strong> $
            {account.total.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p>
            <strong>Fecha:</strong> {account.date.format("DD/MM/YYYY HH:mm")}
          </p>
          <p>
            <strong>Última actualización:</strong>{" "}
            {account.last_update.format("DD/MM/YYYY HH:mm")}
          </p>
          <p>
            <strong>Estado:</strong>{" "}
            {account.status === "paid" ? "Paga" : "Pendiente"}
          </p>
          <Button onClick={handleMarkAsPaid} className="mt-2">
            Marcar como {account.status === "paid" ? "Pendiente" : "Paga"}
          </Button>
        </div>

        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-100">
          Productos
        </h2>
        <div className="flex flex-col mb-12 gap-2">
          {account.productsAccount.map((product, index) => (
            <div
              key={product.id + index}
              className="p-3 border rounded shadow-sm flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{product.description}</p>
                <p className="text-sm text-muted-foreground">
                  Cantidad: {product.amount} – Total: $
                  {(product.salePrice * product.amount).toLocaleString(
                    "es-AR",
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }
                  )}{" "}
                  - Fecha retiro: {product.date.format("DD/MM/YYYY HH:mm")}
                </p>
              </div>
              <div className="flex align-middle  justify-between">
                <PlusButton
                  disable={loading}
                  onClick={() => handleChangeUnit(product.id, 1)}
                  className="mt-2"
                />
                <LessButton
                  disable={loading}
                  onClick={() => handleChangeUnit(product.id, -1)}
                  className="mt-2"
                />
                <DeleteButton
                  disable={loading}
                  onClick={() => handleDeleteProduct(product)}
                ></DeleteButton>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Page;
