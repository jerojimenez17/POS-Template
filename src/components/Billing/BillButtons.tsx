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
    <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 py-4 px-4">
      <Toaster position="top-right" richColors />
      
      {isEditing ? (
        <div className="flex w-full sm:w-auto">
          <Button
            onClick={() => {
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenEditModal(true);
            }}
            className="rounded-lg h-11 px-6 font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm w-full sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
            Actualizar Venta
          </Button>
        </div>
      ) : (
        <>
          <Button
            onClick={() => {
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenFacturaModal(true);
            }}
            className="rounded-lg h-11 px-6 font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 w-full sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Facturar
          </Button>
          
          <Button
            variant="outline"
            onClick={() => {
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenRemitoModal(true);
            }}
            className="rounded-lg h-11 px-6 font-medium border-slate-300 dark:border-slate-600 w-full sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
              <path d="M12 18h.01"/>
            </svg>
            Remito
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-lg h-11 px-6 font-medium border-slate-300 dark:border-slate-600 w-full sm:w-auto">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
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
                  <Button variant="outline" className="rounded-lg">Cerrar</Button>
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
            <DialogTitle>Confirmar creación de Factura</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            ¿Está seguro que desea crear una factura?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-lg">
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
                className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Confirmar
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
            ¿Está seguro que desea sobreescribir esta venta? Se registrará un historial detallado de los cambios.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-lg">
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                variant="default"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
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
                Confirmar
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
            <DialogTitle>Confirmar creación de Remito</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            ¿Está seguro que desea crear un remito?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-lg">
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
                className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Confirmar
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
