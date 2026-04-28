/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";
import { Session } from "next-auth";
import { Button } from "../ui/button";
import { useContext, useEffect, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";
import Modal from "../Modal";
import typeBillState from "@/models/BillState";
import CAE from "@/models/CAE";
import { createAfipVoucherAction } from "@/actions/afip";
import { processSaleAction, updateOrderAction } from "@/actions/sales";
import { toast, Toaster } from "sonner";
import Spinner from "../ui/Spinner";
import ClientSelectionModal from "../ledger/ClientSelectionModal";
import { useRouter } from "next/navigation";
import { useCashbox } from "@/context/CashboxContext";
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
  handlePrint: (cae?: CAE, win?: Window | null) => void;
  isEditing?: boolean;
  orderId?: string;
}
const BillButtons = ({ session, handlePrint, isEditing, orderId }: props) => {
  const router = useRouter();
  const [createVoucherError, setCreateVoucherError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [response, setResponse] = useState("");
  const [respAfip, setRespAfip] = useState<CAE | undefined>();
  const [localCAE, setLocalCAE] = useState<CAE>({ CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" });
  const [openRemitoModal, setOpenRemitoModal] = useState(false);
  const { BillState, billType, CAE, sellerName, removeAll, onOrderResetRef, printMode } =
    useContext(BillContext);
  const [saveError, setSaveError] = useState(false);
  const [openErrorModal, setOpenErrorModal] = useState(false);
  const { hasActiveSession, setIsOpeningModalOpen } = useCashbox();
  const latestCAE = useRef(BillState.CAE); // Agregar estado para rastrear la conexión
  const [isOnline, setIsOnline] = useState(true);

  const checkSession = () => {
    if (!hasActiveSession) {
      toast.error("Debe abrir una sesión de caja antes de realizar esta operación");
      setIsOpeningModalOpen(true);
      return false;
    }
    return true;
  };

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

  // Global keydown listeners for F1, F2, F3 shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return; // Disable shortcuts while editing sale (has different buttons)
      
      if (e.key === 'F1') {
        e.preventDefault();
        if (!checkSession()) return;
        if (session?.user.email) {
          sellerName(session.user.email || "");
        }
        setOpenFacturaModal(true);
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (!checkSession()) return;
        if (session?.user.email) {
          sellerName(session.user.email || "");
        }
        setOpenRemitoModal(true);
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (!checkSession()) return;
        if (BillState.products.length > 0) {
          setOpenAcuentaModal(true);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, sellerName, BillState.products.length, isEditing]);

  // Función para verificar conexión y mostrar error
  const checkConnection = () => {
    if (!isOnline) {
      toast.error("Sin conexión a internet");
      return false;
    }
    return true;
  };

  const handleCreateVoucher = async (): Promise<CAE | null> => {
    if (!checkConnection()) return null;
    try {
      console.log("Calling createAfipVoucherAction");
      const resp = await createAfipVoucherAction(BillState);

      if (resp.error) {
        toast.error(resp.error);
        setBlockButton(false);
        return null;
      }

      const afipData = resp.data.afip || resp.data;
      if (afipData?.CAE) {
        setCreateVoucherError(false);
        const newCAE: CAE = {
          CAE: afipData.CAE,
          vencimiento: afipData.CAEFchVto,
          nroComprobante: resp.data.nroCbte || afipData.nroCbte || 0,
          qrData: resp.data.qrData || afipData.qrData || "",
        };
        CAE(newCAE);
        setLocalCAE(newCAE);
        toast.success("Factura generada correctamente");
        setBlockButton(false);
        return newCAE;
      } else {
        const errorMsg = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
        toast.error(errorMsg);
        setResponse(errorMsg);
        setBlockButton(false);
        return null;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setResponse(err.message);
      toast.error(err.message);
      setCreateVoucherError(true);
      setBlockButton(false);
      console.error(err);
      return null;
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

  const createSale = async (afip: boolean, isUpdate: boolean = false): Promise<CAE | undefined> => {
    if (!checkConnection()) return undefined;
    try {
      setBlockButton(true);
      setOpenRemitoModal(false);
      setOpenEditModal(false);

      const totalAmount =
        BillState.products.reduce(
          (acc, act) => acc + act.salePrice * act.amount,
          0,
        ) *
        (1 - BillState.discount * 0.01);

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
          "El monto del segundo medio de pago debe ser menor al total",
        );
        setOpenErrorModal(true);
        setBlockButton(false);
        return;
      }

      let caeData: CAE | null = null;
      if (afip && !isUpdate) {
        caeData = await handleCreateVoucher();
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
          CAE: caeData || localCAE,
          totalWithDiscount: totalAmount,
        });
        toast.success("Factura guardada correctamente");
      }
      return caeData || localCAE;
    } catch (err) {
      if (!isOnline) {
        toast.error("Operación cancelada: Sin conexión a internet");
      } else {
        toast.error(
          "Error inesperado: " + (err instanceof Error ? err.message : ""),
        );
      }
      setBlockButton(false);
      throw err;
    }
  };
  const [openFacturaModal, setOpenFacturaModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openAcuentaModal, setOpenAcuentaModal] = useState(false);
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Actualizar Venta
          </Button>
        </div>
      ) : (
        <>
          <Button
            onClick={() => {
              if (!checkSession()) return;
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenFacturaModal(true);
            }}
            className="rounded-lg h-11 px-6 font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 w-full sm:w-auto"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Facturar
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (!checkSession()) return;
              if (session?.user.email) {
                sellerName(session.user.email || "");
              }
              setOpenRemitoModal(true);
            }}
            className="rounded-lg h-11 px-6 font-medium border-slate-300 dark:border-slate-600 w-full sm:w-auto"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
              <path d="M12 18h.01" />
            </svg>
            Remito
          </Button>

          <Button
            variant="outline"
            className="rounded-lg h-11 px-6 font-medium border-slate-300 dark:border-slate-600 w-full sm:w-auto"
            disabled={BillState.products.length === 0}
            onClick={() => {
              if (!checkSession()) return;
              setOpenAcuentaModal(true);
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            A cuenta
          </Button>

          <ClientSelectionModal
            open={openAcuentaModal}
            onOpenChange={setOpenAcuentaModal}
            items={BillState.products.map((p) => ({
              id: p.id,
              code: p.code,
              description: p.description,
              salePrice: p.salePrice || 0,
              amount: p.amount,
            }))}
            total={BillState.total}
            businessId={session?.user?.businessId || ""}
            onSuccess={() => {
              removeAll();
              if (onOrderResetRef.current) {
                onOrderResetRef.current();
              }
            }}
          />
        </>
      )}

      {blockButton && <Spinner />}
      <Dialog open={openFacturaModal} onOpenChange={setOpenFacturaModal}>
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
                autoFocus
                onClick={async () => {
                  const targetWin = printMode !== 'thermal' ? window.open("", "_blank") : null;
                  if (targetWin) {
                    targetWin.document.write("<html><head><title>Generando Documento...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>");
                  }

                  setBlockButton(true);
                  try {
                    const caeResult = await createSale(true, false);
                    if (!caeResult) {
                      if (targetWin) targetWin.close();
                      setBlockButton(false);
                      return;
                    }
                    if (!openErrorModal && BillState.total > 0) {
                      handlePrint(caeResult, targetWin);
                      setTimeout(() => {
                        removeAll();
                        if (onOrderResetRef.current) {
                          onOrderResetRef.current();
                        }
                      }, 5000);
                    } else if (targetWin) {
                       targetWin.close();
                    }
                    setOpenFacturaModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    if (targetWin) targetWin.close();
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
      <Dialog open={openEditModal} onOpenChange={setOpenEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar actualización</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            ¿Está seguro que desea sobreescribir esta venta? Se registrará un
            historial detallado de los cambios.
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-lg">
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                autoFocus
                variant="default"
                className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  const targetWin = printMode !== 'thermal' ? window.open("", "_blank") : null;
                  if (targetWin) {
                    targetWin.document.write("<html><head><title>Generando Documento...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Actualizando venta, por favor espere...</h2></body></html>");
                  }

                  setBlockButton(true);
                  try {
                    const caeResult = await createSale(false, true);
                    if (!caeResult && targetWin) targetWin.close();
                    // Don't auto-print on update unless explicitly asked, typically update redirects
                    if (targetWin) targetWin.close(); 
                    setOpenEditModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    if (targetWin) targetWin.close();
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
      <Dialog open={openRemitoModal} onOpenChange={setOpenRemitoModal}>
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
                autoFocus
                onClick={async () => {
                  const targetWin = printMode !== 'thermal' ? window.open("", "_blank") : null;
                  if (targetWin) {
                    targetWin.document.write("<html><head><title>Generando Documento...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>");
                  }

                  setBlockButton(true);
                  try {
                    const caeResult = await createSale(false, false);
                    if (!caeResult) {
                      if (targetWin) targetWin.close();
                      setBlockButton(false);
                      return;
                    }
                    if (!openErrorModal && BillState.total > 0) {
                      handlePrint(caeResult, targetWin);
                      setTimeout(() => {
                        removeAll();
                        if (onOrderResetRef.current) {
                          onOrderResetRef.current();
                        }
                      }, 5000);
                    } else if (targetWin) {
                       targetWin.close();
                    }
                    setOpenRemitoModal(false);
                    setBlockButton(false);
                  } catch (err) {
                    if (targetWin) targetWin.close();
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
