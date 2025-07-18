/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { Session } from "next-auth";
import { Button } from "../ui/button";
import { useContext, useEffect, useRef, useState } from "react";
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
import { updateMonthlyRanking } from "@/firebase/stock/updateRanking";
import { toast, Toaster } from "sonner";
import Spinner from "../ui/Spinner";
import AccountLedgerModal from "../ledger/AccountLedgerModal";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogHeader,
  DialogTrigger,
  DialogDescription,
} from "../ui/dialog";

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
  const { BillState, billType, CAE, sellerName, removeAll } =
    useContext(BillContext);
  const [saveError, setSaveError] = useState(false);
  const [openErrorModal, setOpenErrorModal] = useState(false);
  const latestCAE = useRef(BillState.CAE); // Agregar estado para rastrear la conexión
  const [isOnline, setIsOnline] = useState(true);
  const [openLedgerModal, setOpenLedgerModal] = useState(false);

  // Verificar estado de conexión al montar el componente
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Función para verificar conexión y mostrar error
  const checkConnection = () => {
    if (!isOnline) {
      toast.error("Sin conexión a internet");
      return false;
    }
    return true;
  };

  const handleCreateVoucher = async () => {
    if (!checkConnection()) return; // Verificar conexión
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
        toast.success("Factura generada correctamente");
        setBlockButton(false);
      } else {
        toast.error(resp);
        setResponse(resp);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setResponse(err.message);
      toast.error(err.message);
      setCreateVoucherError(true);
      setBlockButton(false);
      console.error(err);
    }
  };

  const handleSaveSale = async (billState: typeBillState) => {
    if (!checkConnection()) return; // Verificar conexión
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
    if (!checkConnection()) return; // Verificar conexión
    try {
      const productTotal = BillState.products.reduce(
        (acc, p) => acc + p.price * p.amount,
        0
      );
      setBlockButton(true);
      setOpenRemitoModal(false);
      const totalAmount =
        BillState.products.reduce(
          (acc, act) => acc + act.price * act.amount,
          0
        ) -
        BillState.discount *
          0.01 *
          BillState.products.reduce(
            (acc, act) => acc + act.price * act.amount,
            0
          );
      const remainingAmount = totalAmount - (BillState.totalSecondMethod || 0);

      console.log(totalAmount, productTotal);
      if (totalAmount <= 0) {
        setErrorMessage("El monto debe ser mayor a 0");
        setOpenErrorModal(true);
      } else {
        if (
          BillState.totalSecondMethod &&
          totalAmount < BillState.totalSecondMethod
        ) {
          setErrorMessage(
            "El monto del segundo medio de pago debe ser menor al total"
          );
          setOpenErrorModal(true);
        } else {
          if (afip) {
            await handleCreateVoucher();
          }
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

            const secondaryProducts = BillState.products.map(
              (product, index) => {
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
              }
            );

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
            toast.success("Factura 1 guardada correctamente");
            await handleSaveSale({
              ...BillState,
              CAE: latestCAE.current,
              discount: 0,
              total: secondaryMove.total,
              totalWithDiscount: secondaryMove.total,
              paidMethod: BillState.secondPaidMethod,
              products: secondaryProducts,
            });
            toast.success("Factura 2 guardada correctamente");
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
            await handleSaveSale({
              ...BillState,
              CAE: latestCAE.current,
              totalWithDiscount:
                BillState.total - BillState.total * BillState.discount * 0.01,
            });
          }
          toast.success("Factura guardada correctamente");

          await updateAmount(BillState.products);

          await updateMonthlyRanking(BillState.products);
        }
        // setTimeout(() => {
        // }, 5000);
      }
    } catch (err) {
      // Agregar manejo de error de conexión en el catch general
      if (!isOnline) {
        toast.error("Operación cancelada: Sin conexión a internet");
      } else {
        toast.error(
          "Error inesperado: " + (err instanceof Error ? err.message : "")
        );
      }
      setBlockButton(false);
    }
  };
  const [openFacturaModal, setOpenFacturaModal] = useState(false);
  const [blockButton, setBlockButton] = useState(false);
  return (
    <div className="w-full flex h-14 gap-1 justify-center">
      <Toaster position="top-right" richColors />
      <div className="flex">
        <Button
          onClick={() => {
            if (session?.user.email) {
              sellerName(session.user.email || "");
            }
            setOpenFacturaModal(true);
          }}
          className="rounded-xl w-24"
        >
          Facturar
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
      {/* <Button
          variant="outline"
          onClick={() => {
            if (session?.user.email) {
              sellerName(session.user.email || "");
            }
            setOpenLedgerModal(true);
          }}
          className="rounded-xl w-24"
        >
          A cuenta
        </Button> */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="rounded-xl w-24">
            A cuenta
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <p>Buscar Cuenta</p>
            </DialogTitle>
          </DialogHeader>
          <AccountLedgerModal billState={BillState} />
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {blockButton && <Spinner />}
      <Dialog
        // blockButton={blockButton}
        open={openFacturaModal}
        // onClose={() => setOpenFacturaModal(false)}
        // onCancel={() => setOpenFacturaModal(false)}
        // message={"Confirmar creacion de Factura C"}
        // onAcept={async () => {
        //   setBlockButton(true);
        //   try {
        //     await createSale(true);
        //     if (!openErrorModal && BillState.total > 0) {
        //       handlePrint();
        //       setTimeout(() => {
        //         removeAll();
        //         handlePrint();
        //       }, 5000);
        //     }
        //     setOpenFacturaModal(false);

        //     setBlockButton(false);
        //   } catch (err) {
        //     console.error(err);
        //   }
        // }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar creacion de Factura</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Seguro que desea crear una Factura?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={() => setOpenFacturaModal(false)}>
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={async () => {
                  setBlockButton(true);
                  try {
                    await createSale(true);
                    if (!openErrorModal && BillState.total > 0) {
                      handlePrint();
                      setTimeout(() => {
                        removeAll();
                        handlePrint();
                      }, 5000);
                    }
                    setOpenFacturaModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Aceptar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        // blockButton={blockButton}
        open={openRemitoModal}
        // onClose={() => setOpenRemitoModal(false)}
        // message={"Confirmar creacion de Remito"}
        // onAcept={async () => {
        //   setBlockButton(true);
        //   try {
        //     await createSale(false);
        //     if (!openErrorModal && BillState.total > 0) {
        //       handlePrint();
        //       setTimeout(() => {
        //         removeAll();
        //         handlePrint();
        //       }, 5000);
        //     }
        //     setOpenRemitoModal(false);
        //     setBlockButton(false);
        //   } catch (err) {
        //     console.error(err);
        //   }
        // }}
        // onCancel={() => setOpenRemitoModal(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar creacion de Remito</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Seguro que desea crear un Remito?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={() => setOpenRemitoModal(false)}>
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={async () => {
                  setBlockButton(true);
                  try {
                    await createSale(false);
                    if (!openErrorModal && BillState.total > 0) {
                      handlePrint();
                      setTimeout(() => {
                        removeAll();
                        handlePrint();
                      }, 5000);
                    }
                    setOpenRemitoModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    console.error(err);
                  }
                }}
              >
                Aceptar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Modal
        visible={openErrorModal}
        onClose={() => setOpenErrorModal(false)}
        blockButton={false}
        message={errorMessage}
      ></Modal>
    </div>
  );
};

export default BillButtons;
