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
import { processSaleAction, updateOrderAction } from "@/actions/sales";
import { toast, Toaster } from "sonner";
import Spinner from "../ui/Spinner";
import AccountLedgerModal from "../ledger/AccountLedgerModal";
import { useRouter } from "next/navigation";
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
  isEditing?: boolean;
  orderId?: string;
}
const BillButtons = ({ session, handlePrint, isEditing, orderId }: props) => {
  const router = useRouter();
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
    if (!checkConnection()) return;
    try {
      const result = await processSaleAction(billState);
      if (result.error) {
        toast.error(result.error);
        setSaveError(true);
      } else {
        setSaveError(false);
      }
      setBlockButton(false);
    } catch (err) {
      console.error(err);
      setBlockButton(false);
      setSaveError(true);
    }
  };

  const createSale = async (afip: boolean, isUpdate: boolean = false) => {
    if (!checkConnection()) return;
    try {
      setBlockButton(true);
      setOpenRemitoModal(false);
      setOpenEditModal(false);

      const totalAmount =
        BillState.products.reduce(
          (acc, act) => acc + act.price * act.amount,
          0
        ) * (1 - BillState.discount * 0.01);

      if (totalAmount <= 0) {
        setErrorMessage("El monto debe ser mayor a 0");
        setOpenErrorModal(true);
        setBlockButton(false);
        return;
      }

      if (
        BillState.totalSecondMethod &&
        totalAmount < BillState.totalSecondMethod
      ) {
        setErrorMessage(
          "El monto del segundo medio de pago debe ser menor al total"
        );
        setOpenErrorModal(true);
        setBlockButton(false);
        return;
      }

      if (afip && !isUpdate) {
        await handleCreateVoucher();
      }

      if (isUpdate && orderId) {
        const updateResult = await updateOrderAction(orderId, {
          ...BillState,
          totalWithDiscount: totalAmount,
        });
        
        if ("error" in updateResult && updateResult.error) {
          throw new Error(String(updateResult.error));
        }
        
        toast.success("Venta actualizada correctamente");
        router.push(`/sales/${orderId}`);
      } else {
        await handleSaveSale({
          ...BillState,
          CAE: latestCAE.current,
          totalWithDiscount: totalAmount,
        });
        toast.success("Factura guardada correctamente");
      }
    } catch (err) {
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
  const [openEditModal, setOpenEditModal] = useState(false);
  const [blockButton, setBlockButton] = useState(false);
  return (
    <div className="w-full flex h-14 gap-1 justify-center">
      <Toaster position="top-right" richColors />
      
      {isEditing ? (
        <div className="flex">
          <Button
            onClick={() => {
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenEditModal(true);
            }}
            className="rounded-xl w-48 text-white bg-blue-600 hover:bg-blue-700"
          >
            Actualizar Venta
          </Button>
        </div>
      ) : (
        <>
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
        </>
      )}

      {blockButton && <Spinner />}
      <Dialog
        open={openFacturaModal}
        onOpenChange={setOpenFacturaModal}
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
                    await createSale(true, false);
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
      
      {/* UPDATE DIALOG */}
      <Dialog
        open={openEditModal}
        onOpenChange={setOpenEditModal}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar actualización</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            ¿Estás seguro que deseas sobreescribir esta venta? Se registrará un historial detallado de los cambios.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button onClick={() => setOpenEditModal(false)}>
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="default"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  setBlockButton(true);
                  try {
                    await createSale(false, true);
                    setOpenEditModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    console.error(err);
                    setBlockButton(false);
                  }
                }}
              >
                Confirmar Actualización
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={openRemitoModal}
        onOpenChange={setOpenRemitoModal}
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
                    await createSale(false, false);
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
