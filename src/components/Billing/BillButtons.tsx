/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { Session } from "next-auth";
import { Button } from "../ui/button";
import { useContext, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";
import Modal from "../Modal";
import typeBillState from "@/models/BillState";
import CAE from "@/models/CAE";
import postBill from "@/services/AFIPService";
import { updateTotal } from "@/services/firebaseService";
import Movement from "@/models/Movement";
import newMovement from "@/firebase/cashMovements/newMovement";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/firebase/config";
import { updateAmount } from "@/firebase/stock/updateAmount";

interface props {
  session: Session | null;
  handlePrint: () => void;
}
const BillButtons = ({ session, handlePrint }: props) => {
  const [createVoucherError, setCreateVoucherError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [response, setResponse] = useState("");
  const [respAfip, setRespAfip] = useState<CAE | undefined>();
  const [openRemitoModal, setOpenRemitoModal] = useState(false);
  const { BillState, tipoFactura, CAE, sellerName, removeAll } =
    useContext(BillContext);
  const [saveError, setSaveError] = useState(false);
  const [openErrorModal, setOpenErrorModal] = useState(false);
  const latestCAE = useRef(BillState.CAE);

  const handleCreateVoucher = async () => {
    try {
      const resp = await postBill(BillState);
      if (resp.afip) {
        console.log(resp);
        setCreateVoucherError(false);
        CAE({
          CAE: resp.afip.CAE,
          vencimiento: resp.afip.CAEFchVto,
          nroComprobante: resp.nroCbte,
          qrData: resp.qrData,
        });
        setBlockButton(false);
      } else {
        setResponse(resp);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setResponse(err.message);
      setCreateVoucherError(true);
      setBlockButton(false);
      console.error(err);
    }
  };

  // const handleAcept = async () => {
  //   setBlockButton(true);
  //   setOpenModal(false);
  //   await handleCreateVoucher();

  //   if (BillState.paidMethod === "Efectivo") {
  //     await updateTotal(
  //       BillState.products.reduce(
  //         (acc, act) => acc + act.price * act.amount,
  //         0
  //       ) -
  //         BillState.products.reduce(
  //           (acc, act) => acc + act.price * act.amount,
  //           0
  //         ) *
  //           BillState.discount *
  //           0.01
  //     );

  //     let move: Movement = new Movement();
  //     move.total =
  //       BillState.products.reduce(
  //         (acc, act) => acc + act.price * act.amount,
  //         0
  //       ) -
  //       BillState.products.reduce(
  //         (acc, act) => acc + act.price * act.amount
  // ,
  //         0
  //       ) *
  //         BillState.discount *
  //         0.01;
  //     move.seller = user?.email ? user.email : "";

  //     await newMovement(move);
  //   }
  //   // await handleSaveSale();`
  //   await updateAmount(BillState.products);
  //   setPrint(true);
  //   setTimeout(() => {
  //     removeAll();
  //     setBlockButton(false);
  //   }, 5000);
  // };

  const handleSaveSale = async (billState: typeBillState) => {
    try {
      const collectionRef = collection(db, "sales");
      console.log(billState);
      await addDoc(collectionRef, billState);
      setBlockButton(false);
      // setDiscountState(0);

      setSaveError(false);
    } catch (err) {
      console.error(err);
      setBlockButton(false);
      setSaveError(true);
    }
  };

  const createSale = async (afip: boolean) => {
    const productTotal = BillState.products.reduce(
      (acc, p) => acc + p.price * p.amount,
      0
    );
    setBlockButton(true);
    setOpenRemitoModal(false);
    if (afip) {
      await handleCreateVoucher();
    }
    const totalAmount =
      BillState.products.reduce((acc, act) => acc + act.price * act.amount, 0) -
      BillState.discount *
        0.01 *
        BillState.products.reduce(
          (acc, act) => acc + act.price * act.amount,
          0
        );
    const remainingAmount = totalAmount - (BillState.totalSecondMethod || 0);

    console.log(totalAmount, productTotal);
    if (totalAmount < 0) {
      setErrorMessage("El monto debe ser mayor a 0");
      setOpenErrorModal(true);
    } else {
      if (
        BillState.twoMethods &&
        BillState.totalSecondMethod &&
        BillState.totalSecondMethod > 0
      ) {
        // Crear dos listas de productos, ajustando las unidades y precios para cada método de pago
        console.log(respAfip);
        const primaryProducts = BillState.products.map((product, index) => {
          const newProduct = { ...product };
          if (index === 0) {
            newProduct.salePrice = remainingAmount;
            newProduct.gain = 1;
            newProduct.amount = 1;
            newProduct.price = remainingAmount;
          } else {
            newProduct.amount = 0;
          }
          return newProduct;
        });

        const secondaryProducts = BillState.products.map((product, index) => {
          const newProduct = { ...product };
          if (index === 0) {
            newProduct.price = BillState.totalSecondMethod || 0;
            newProduct.amount = 1;
            newProduct.gain = 1;
            newProduct.salePrice = BillState.totalSecondMethod || 0;
          } else {
            newProduct.amount = 0;
          }
          return newProduct;
        });

        // Crear y registrar movimientos separados para cada método de pago
        if (BillState.paidMethod === "Efectivo") {
          await updateTotal(remainingAmount); // Actualizar el total para el primer método de pago si es efectivo
        }

        const primaryMove = new Movement();
        primaryMove.seller = session?.user?.email || "";
        primaryMove.paidMethod = BillState.paidMethod || "Efectivo";
        primaryMove.total = remainingAmount;
        await newMovement(primaryMove);

        if (BillState.secondPaidMethod === "Efectivo") {
          await updateTotal(BillState.totalSecondMethod); // Actualizar el total para el segundo método de pago si es efectivo
        }

        const secondaryMove = new Movement();
        secondaryMove.seller = session?.user?.email || "";
        secondaryMove.paidMethod = BillState.secondPaidMethod || "";
        secondaryMove.total = BillState.totalSecondMethod;
        await newMovement(secondaryMove);

        // Guardar ambas listas de productos en la base de datos (ajusta según tu lógica de negocio)
        console.log(respAfip);
        console.log(BillState.CAE);
        await handleSaveSale({
          ...BillState,
          products: primaryProducts,
          discount: 0,
          total: primaryMove.total,
          CAE: latestCAE.current,
          totalWithDiscount: primaryMove.total,
        });
        console.log({
          ...BillState,
          products: primaryProducts,
          total: primaryMove.total,
          totalWithDiscount: primaryMove.total,
        });
        console.log({
          ...BillState,
          total: secondaryMove.total,
          totalWithDiscount: secondaryMove.total,
          paidMethod: BillState.secondPaidMethod,
          products: secondaryProducts,
        });
        await handleSaveSale({
          ...BillState,
          discount: 0,
          total: secondaryMove.total,
          totalWithDiscount: secondaryMove.total,
          paidMethod: BillState.secondPaidMethod,
          products: secondaryProducts,
        });
      } else {
        // Lógica original para una sola venta

        if (BillState.paidMethod === "Efectivo") {
          await updateTotal(totalAmount); // Actualizar total si el único método de pago es efectivo
        }

        const move = new Movement();
        move.seller = session?.user?.email || "";
        move.paidMethod = BillState.paidMethod || "Efectivo";
        move.total = totalAmount;
        await newMovement(move);
        await handleSaveSale({ ...BillState, CAE: latestCAE.current });
      }

      await updateAmount(BillState.products);
    }
    // setTimeout(() => {
    // }, 5000);
  };
  const [openFacturaModal, setOpenFacturaModal] = useState(false);
  const [blockButton, setBlockButton] = useState(false);
  return (
    <div className="w-full flex h-14 gap-1 justify-center">
      <div className="flex">
        <Button
          onClick={() => {
            if (session?.user.email) {
              sellerName(session.user.email || "");
              tipoFactura("C");
            }
            setOpenFacturaModal(true);
          }}
          className="rounded-xl w-24"
        >
          Factura C
        </Button>
      </div>
      <div className="flex">
        <Button
          variant="outline"
          onClick={() => {
            if (session?.user.email) {
              sellerName(session.user.email || "");
            }
            setOpenRemitoModal(true);
          }}
          className="rounded-xl w-24"
        >
          Remito
        </Button>
      </div>

      <Modal
        blockButton={blockButton}
        visible={openFacturaModal}
        onClose={() => setOpenFacturaModal(false)}
        message={"Confirmar creacion de Factura C"}
        onAcept={async () => {
          setBlockButton(true);
          await createSale(true);
          handlePrint();
          setTimeout(() => {
            removeAll();
          }, 5000);
          setOpenFacturaModal(false);

          setBlockButton(false);
        }}
        onCancel={() => setOpenRemitoModal(false)}
      />
      <Modal
        blockButton={blockButton}
        visible={openRemitoModal}
        onClose={() => setOpenFacturaModal(false)}
        message={"Confirmar creacion de Remito"}
        onAcept={async () => {
          setBlockButton(true);
          await createSale(false);
          handlePrint();
          setTimeout(() => {
            removeAll();
          }, 5000);
          setOpenRemitoModal(false);
          setBlockButton(false);
        }}
        onCancel={() => setOpenRemitoModal(false)}
      />
    </div>
  );
};

export default BillButtons;
