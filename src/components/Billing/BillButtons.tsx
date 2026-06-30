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
import { Lock, FileText, Wallet, CheckCircle } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useFeatures } from "@/hooks/useFeatures";
import { createBudgetAction } from "@/actions/budget";

interface props {
  session: Session | null;
  handlePrint: (cae?: CAE, win?: Window | null) => void;
  isEditing?: boolean;
  orderId?: string;
}
const BillButtonsDefault = ({ session, handlePrint, isEditing, orderId }: props) => {
  const canUseBudget = session?.user?.business?.features?.hasBudget ?? false;
  const router = useRouter();
  const [createVoucherError, setCreateVoucherError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [response, setResponse] = useState("");
  const [respAfip, setRespAfip] = useState<CAE | undefined>();
  const [localCAE, setLocalCAE] = useState<CAE>({ CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" });
  const [openRemitoModal, setOpenRemitoModal] = useState(false);
  const [openFacturaModal, setOpenFacturaModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [openAcuentaModal, setOpenAcuentaModal] = useState(false);
  const [openBudgetModal, setOpenBudgetModal] = useState(false);
  const { BillState, dispatch, onOrderResetRef, printMode } =
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
          dispatch({ type: "sellerName", payload: session.user.email || "" });
        }
        setOpenFacturaModal(true);
      }
      if (e.key === 'F2') {
        e.preventDefault();
        if (!checkSession()) return;
        if (session?.user.email) {
          dispatch({ type: "sellerName", payload: session.user.email || "" });
        }
        setOpenRemitoModal(true);
      }
      if (e.key === 'F3') {
        e.preventDefault();
        if (!checkSession()) return;
        if (BillState.products?.length > 0) {
          setOpenAcuentaModal(true);
        }
      }
      if (e.key === 'F4') {
        e.preventDefault();
        if (!checkSession()) return;
        if (BillState.products?.length > 0) {
          setOpenBudgetModal(true);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session, dispatch, BillState.products?.length, isEditing, setOpenBudgetModal]);

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
        dispatch({ type: "CAE", payload: newCAE });
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

  /** Minimal product fields needed by server actions */
  const toMinimalProducts = (products: typeBillState["products"]) =>
    products.map((p) => ({
      id: p.id,
      code: p.code,
      description: p.description,
      price: p.price,
      salePrice: p.salePrice,
      amount: p.amount,
    }));

  const handleSaveSale = async (billState: typeBillState): Promise<boolean> => {
    if (!checkConnection()) return false;
    try {
      // Send only minimal product data to reduce Server Action payload
      const result = await processSaleAction({
        ...billState,
        products: toMinimalProducts(billState.products),
      });
      if ('error' in result && result.error) {
        toast.error(result.error as string);
        setSaveError(true);
        return false;
      } else {
        setSaveError(false);
        return true;
      }
    } catch (err) {
      console.error(err);
      setSaveError(true);
      return false;
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
          products: toMinimalProducts(BillState.products),
          totalWithDiscount: totalAmount,
        });

        if ("error" in updateResult && updateResult.error) {
          throw new Error(String(updateResult.error));
        }

        toast.success("Venta actualizada correctamente");
        router.push(`/sales/${orderId}`);
      } else {
        const saveSuccess = await handleSaveSale({
          ...BillState,
          CAE: caeData || localCAE,
          totalWithDiscount: totalAmount,
        });
        if (saveSuccess) {
          toast.success("Factura guardada correctamente");
        }
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
  const [blockButton, setBlockButton] = useState(false);
  return (
    <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 py-4 px-4">
      <Toaster position="top-right" richColors />

      {isEditing ? (
        <div className="flex w-full sm:w-auto">
          <Button
            onClick={() => {
              if (session?.user.email) {
                dispatch({ type: "sellerName", payload: session.user.email || "" });
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
                dispatch({ type: "sellerName", payload: session.user.email || "" });
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
                dispatch({ type: "sellerName", payload: session.user.email || "" });
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

          {canUseBudget && (
            <>
              <Button
                variant="outline"
                className="rounded-lg h-11 px-6 font-medium border-slate-300 dark:border-slate-600 w-full sm:w-auto"
                disabled={BillState.products.length === 0}
                onClick={() => {
                  if (!checkSession()) return;
                  if (session?.user.email) {
                    dispatch({ type: "sellerName", payload: session.user.email || "" });
                  }
                  setOpenBudgetModal(true);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
                Presupuesto
              </Button>
              <ClientSelectionModal
                mode="budget"
                open={openBudgetModal}
                onOpenChange={setOpenBudgetModal}
                items={BillState.products.map((p) => ({
                  id: p.id,
                  code: p.code,
                  description: p.description,
                  salePrice: p.salePrice || 0,
                  amount: p.amount,
                }))}
                total={BillState.total}
                totalWithDiscount={BillState.products.reduce(
                  (acc, act) => acc + act.salePrice * act.amount,
                  0,
                ) * (1 - BillState.discount * 0.01)}
                discount={BillState.discount}
                seller={session?.user?.email || ""}
                businessId={session?.user?.businessId || ""}
                onSuccess={() => {
                  const targetWin = printMode !== 'thermal' ? window.open("", "_blank") : null;
                  if (targetWin) {
                    targetWin.document.write("<html><head><title>Generando Presupuesto...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando presupuesto, por favor espere...</h2></body></html>");
                  }
                  dispatch({ type: "billType", payload: "Presupuesto" });
                  handlePrint(undefined, targetWin);
                  setTimeout(() => {
                    dispatch({ type: "removeAll", payload: null });
                    if (onOrderResetRef.current) {
                      onOrderResetRef.current();
                    }
                  }, 5000);
                }}
              />
            </>
          )}

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
              dispatch({ type: "removeAll", payload: null });
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
                        dispatch({ type: "removeAll", payload: null });
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
                        dispatch({ type: "removeAll", payload: null });
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

export default BillButtonsDefault;

interface BillButtonsProps {
  onStandardCheckout: () => void;
  onLedgerCheckout: () => void;
  onAfipCheckout: () => void;
  disabled?: boolean;
}

export const BillButtons: React.FC<BillButtonsProps> = ({
  onStandardCheckout,
  onLedgerCheckout,
  onAfipCheckout,
  disabled = false,
}) => {
  const { hasFeature, isDelinquent } = useFeatures();
  
  const canUseLedger = hasFeature("hasClientLedger");
  const canUseAfip = hasFeature("hasAfipBilling");

  // Keyboard shortcut listener (F1, F2, F3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || isDelinquent) return;
      
      if (e.key === "F1") {
        e.preventDefault();
        onStandardCheckout();
      } else if (e.key === "F2") {
        e.preventDefault();
        if (canUseLedger) {
          onLedgerCheckout();
        }
      } else if (e.key === "F3") {
        e.preventDefault();
        if (canUseAfip) {
          onAfipCheckout();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, isDelinquent, canUseLedger, canUseAfip, onStandardCheckout, onLedgerCheckout, onAfipCheckout]);

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {/* F1: Standard Checkout */}
        <button
          onClick={onStandardCheckout}
          disabled={disabled || isDelinquent}
          className="flex flex-col items-center justify-center p-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl shadow-lg border border-emerald-500 transition-all font-semibold relative overflow-hidden group"
        >
          <CheckCircle className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform" />
          <span className="text-sm">Efectivo / Débito</span>
          <kbd className="mt-2 text-xs bg-emerald-800 px-2 py-0.5 rounded opacity-80 border border-emerald-700">F1</kbd>
        </button>

        {/* F2: Client Ledger Checkout */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div className="w-full">
              <button
                onClick={onLedgerCheckout}
                disabled={disabled || isDelinquent || !canUseLedger}
                className={`w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-lg border transition-all font-semibold relative overflow-hidden group
                  ${canUseLedger 
                    ? "bg-sky-600 hover:bg-sky-700 border-sky-500 text-white cursor-pointer" 
                    : "bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-400 cursor-not-allowed"
                  }
                  ${(disabled || isDelinquent) && "opacity-50 cursor-not-allowed"}
                `}
              >
                {!canUseLedger && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500 text-[10px] text-white font-extrabold px-1.5 py-0.5 rounded shadow">
                    <Lock className="h-3 w-3" /> PRO
                  </div>
                )}
                <Wallet className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Cargar a Cuenta Corriente</span>
                <kbd className={`mt-2 text-xs px-2 py-0.5 rounded border ${canUseLedger ? "bg-sky-800 border-sky-700 text-sky-100 opacity-80" : "bg-gray-200 dark:bg-zinc-700 text-gray-400 border-gray-300 dark:border-zinc-600"}`}>F2</kbd>
              </button>
            </div>
          </Tooltip.Trigger>
          {!canUseLedger && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="top"
                className="bg-zinc-900 text-white border border-zinc-700 text-xs px-3 py-1.5 rounded-lg shadow-xl max-w-xs leading-relaxed z-50"
                sideOffset={5}
              >
                La función de Cuenta Corriente requiere una suscripción **Plan PRO** o superior.
                <Tooltip.Arrow className="fill-zinc-950" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>

        {/* F3: AFIP Electronic Checkout */}
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <div className="w-full">
              <button
                onClick={onAfipCheckout}
                disabled={disabled || isDelinquent || !canUseAfip}
                className={`w-full flex flex-col items-center justify-center p-4 rounded-xl shadow-lg border transition-all font-semibold relative overflow-hidden group
                  ${canUseAfip 
                    ? "bg-violet-600 hover:bg-violet-700 border-violet-500 text-white cursor-pointer" 
                    : "bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-400 cursor-not-allowed"
                  }
                  ${(disabled || isDelinquent) && "opacity-50 cursor-not-allowed"}
                `}
              >
                {!canUseAfip && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500 text-[10px] text-white font-extrabold px-1.5 py-0.5 rounded shadow">
                    <Lock className="h-3 w-3" /> ENTERPRISE
                  </div>
                )}
                <FileText className="h-6 w-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Facturación Electrónica</span>
                <kbd className={`mt-2 text-xs px-2 py-0.5 rounded border ${canUseAfip ? "bg-violet-800 border-violet-700 text-violet-100 opacity-80" : "bg-gray-200 dark:bg-zinc-700 text-gray-400 border-gray-300 dark:border-zinc-600"}`}>F3</kbd>
              </button>
            </div>
          </Tooltip.Trigger>
          {!canUseAfip && (
            <Tooltip.Portal>
              <Tooltip.Content
                side="top"
                className="bg-zinc-900 text-white border border-zinc-700 text-xs px-3 py-1.5 rounded-lg shadow-xl max-w-xs leading-relaxed z-50"
                sideOffset={5}
              >
                La Facturación Electrónica ARCA requiere una suscripción **Plan ENTERPRISE**.
                <Tooltip.Arrow className="fill-zinc-950" />
              </Tooltip.Content>
            </Tooltip.Portal>
          )}
        </Tooltip.Root>
      </div>
    </Tooltip.Provider>
  );
};
