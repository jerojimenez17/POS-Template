"use client";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { BillParametersSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormField, FormItem, FormLabel, Form } from "../ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";
import { getVoucherNumberAction } from "@/actions/voucher";
import { getDefaultBillType } from "@/utils/billing";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { formatAfipPointSaleErrorForUser, type AfipPointSaleError } from "@/services/afip/point-sale-validation";

const getVoucherTypeCode = (billType: string): 1 | 6 | 11 => {
  if (billType === BillTypes.A) return 1;
  if (billType === BillTypes.B) return 6;
  return 11;
};

interface BillParametersFormProps {
  ptoVentas?: number[];
  initialBillType?: string;
}

const BillParametersForm = ({ ptoVentas = [], initialBillType }: BillParametersFormProps) => {
  const [editParamters, setEditParameters] = useState(false);
  const [lastVoucherNum, setLastVoucherNum] = useState<number | null>(null);
  const [loadingVoucher, setLoadingVoucher] = useState(true);
  const [voucherError, setVoucherError] = useState<AfipPointSaleError | string | null>(null);
  const requestSequence = useRef(0);
  const context = useContext(BillContext);
  const dispatch = context?.dispatch;
  const BillState = context?.BillState;
  const onOrderResetRef = context?.onOrderResetRef;
  const billTypeRef = context?.billTypeRef;
  const defaultBillType = initialBillType ?? context?.initialBillType ?? getDefaultBillType();

  const form = useForm<z.infer<typeof BillParametersSchema>>({
    resolver: zodResolver(BillParametersSchema),
    defaultValues: {
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
      billType: defaultBillType,
      totalSecondMethod: 0,
      secondPaidMethod: PaidMethods.DEBITO,
      ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
    },
  });

  const watchBillType = form.watch("billType");
  const watchPtoVenta = form.watch("ptoVenta");
  const watchClientCondition = form.watch("clientCondition");

  // The new-sale page supplies the business default server-side. Only the
  // standalone form path needs this fallback lookup, so the normal page does
  // not fetch the business billing data a second time in the browser.
  useEffect(() => {
    if (initialBillType !== undefined || context?.initialBillType !== undefined) return;

    let cancelled = false;
    void Promise.resolve(getBusinessBillingInfoAction())
      .then((info) => {
        if (cancelled) return;
        const nextBillType = getDefaultBillType(info?.condicionIva);
        form.setValue("billType", nextBillType);
        if (dispatch) dispatch({ type: "billType", payload: nextBillType });
        if (billTypeRef) billTypeRef.current = nextBillType;
      })
      .catch(() => {
        // getDefaultBillType() already provides the required Factura C fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [initialBillType, context?.initialBillType, form, dispatch, billTypeRef]);

  // Keep the point of sale used for the displayed number attached to the
  // checkout state as well. This is intentionally a single synchronization,
  // not another voucher lookup.
  useEffect(() => {
    const initialPtoVenta = ptoVentas[0];
    if (!dispatch || !BillState || initialPtoVenta === undefined) return;
    if (BillState.ptoVenta === initialPtoVenta && BillState.billType === defaultBillType) return;
    dispatch({
      type: "setState",
      payload: { ...BillState, ptoVenta: initialPtoVenta, billType: defaultBillType },
    });
  }, [dispatch, BillState, defaultBillType, ptoVentas]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const fetchVoucher = async () => {
      if (!watchPtoVenta) return;
      setLoadingVoucher(true);
      
       const tipoFactura = getVoucherTypeCode(watchBillType);

       const res = await getVoucherNumberAction(watchPtoVenta, tipoFactura);
       console.log("[getLastVoucher] result", {
         success: typeof res.success === "number",
         errorType: typeof res.error,
         errorCode: res.errorDetails?.code,
         operation: res.errorDetails?.operation,
         ptoVenta: watchPtoVenta,
         tipoFactura,
       });
      if (requestId !== requestSequence.current) return;
       if (res.success !== undefined) {
         setLastVoucherNum(res.success);
         setVoucherError(null);
       } else {
         setLastVoucherNum(null);
         setVoucherError(res.errorDetails ?? res.error ?? "No se pudo obtener la numeración");
       }
      setLoadingVoucher(false);
    };

    fetchVoucher();
  }, [ptoVentas, watchBillType, watchPtoVenta]);

  useEffect(() => {
    if (onOrderResetRef) {
      onOrderResetRef.current = () => {
        form.reset({
          paidMethod: PaidMethods.EFECTIVO,
          clientCondition: ClientConditions.CONSUMIDOR_FINAL,
          discount: 0,
          twoMethods: false,
           billType: defaultBillType,
          totalSecondMethod: 0,
          secondPaidMethod: PaidMethods.DEBITO,
          ptoVenta: ptoVentas.length > 0 ? ptoVentas[0] : undefined,
         });
          if (dispatch) dispatch({ type: "billType", payload: defaultBillType });
          if (dispatch && ptoVentas.length > 0) dispatch({ type: "setState", payload: { ...BillState, ptoVenta: ptoVentas[0], billType: defaultBillType } });
         if (billTypeRef) billTypeRef.current = defaultBillType;
        setEditParameters(false);
      };
    }
  }, [form, onOrderResetRef, defaultBillType, dispatch, billTypeRef, ptoVentas, BillState]);

  const currentDate = useMemo(() => new Date(), []);

  const voucherErrorMessage = typeof voucherError === "string"
    ? voucherError
    : voucherError
      ? formatAfipPointSaleErrorForUser(voucherError)
      : null;
  const structuredVoucherError = voucherError && typeof voucherError !== "string" ? voucherError : null;

  const onSubmit = (data: z.infer<typeof BillParametersSchema>) => {
    const documentNumber = data.documentNumber ?? 0;
    
    dispatch({
      type: "setState",
      payload: {
        ...data,
        discount: BillState.discount,
        id: "",
        products: BillState.products,
        total: BillState.total,
        totalWithDiscount: BillState.totalWithDiscount,
        seller: BillState.seller,
        date: currentDate,
        typeDocument: data.clientCondition,
        documentNumber,
        IVACondition: data.clientCondition,
        clientIvaCondition: data.clientCondition,
        clientDocumentNumber: String(documentNumber),
      },
    });
    
    setEditParameters(false);
  };
  return editParamters ? (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Grid de 3 columnas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Comprobante */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              Comprobante
            </div>
            
            <div className="space-y-3">
              <FormField
                control={form.control}
                name={"billType"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Tipo</FormLabel>
                    <Select {...field} onValueChange={(value) => {
                       field.onChange(value);
                       dispatch?.({ type: "billType", payload: value });
                       if (billTypeRef) billTypeRef.current = value;
                    }}>
                      <SelectTrigger className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                        <SelectValue placeholder={field.value} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(BillTypes).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              {ptoVentas.length > 0 && (
                <FormField
                  control={form.control}
                  name="ptoVenta"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Pto. Venta</FormLabel>
                      <Select 
                        value={field.value ? String(field.value) : undefined} 
                         onValueChange={(val) => {
                           const point = Number(val);
                           field.onChange(point);
                           if (dispatch && BillState) dispatch({ type: "setState", payload: { ...BillState, ptoVenta: point, billType: watchBillType } });
                         }}
                      >
                        <SelectTrigger className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                          <SelectValue placeholder="Seleccione" />
                        </SelectTrigger>
                        <SelectContent>
                          {ptoVentas.map((pto) => (
                            <SelectItem key={pto} value={String(pto)}>
                              {String(pto).padStart(3, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name={"clientCondition"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Condición IVA</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                        <SelectValue placeholder={field.value} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ClientConditions).map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

               {watchClientCondition !== ClientConditions.CONSUMIDOR_FINAL && (
                <FormField
                  control={form.control}
                  name="documentNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-gray-600 dark:text-gray-300">
                        {watchClientCondition === ClientConditions.CUIT
                          ? "CUIT"
                          : "DNI"}
                      </FormLabel>
                      <Input
                        className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        type="number"
                        name={field.name}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>

          {/* Pago */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                <rect width="20" height="14" x="2" y="5" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
              Pago
            </div>
            
            <div className="space-y-3">
              <FormField
                control={form.control}
                name={"paidMethod"}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Medio</FormLabel>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                        <SelectValue placeholder={field.value} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PaidMethods).map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name={"twoMethods"}
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                    <FormLabel className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                      Dividir pago
                    </FormLabel>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormItem>
                )}
              />

              {form.watch("twoMethods") && (
                <div className="space-y-3 pl-2 border-l-2 border-gray-200 dark:border-gray-600">
                  <FormField
                    control={form.control}
                    name={"secondPaidMethod"}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Segundo medio</FormLabel>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="h-10 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                            <SelectValue placeholder={field.value} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(PaidMethods).map((method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="totalSecondMethod"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Monto</FormLabel>
                        <Input
                          className="h-10 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                          placeholder="0"
                          {...field}
                          onChange={field.onChange}
                        />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Descuento - ahora se edita desde el componente DiscountControl en el Totals section */}
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="button"
            className="h-10 rounded-lg font-medium px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 dark:border-gray-600"
            onClick={() => setEditParameters(false)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="h-10 rounded-lg font-medium px-6 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Guardar cambios
          </Button>
        </div>
      </form>
    </Form>
  ) : (
    <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm">
      {/* Comprobante y Pto Venta */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" onClick={() => setEditParameters(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {form.getValues().billType}
          </span>
          {form.getValues().ptoVenta && (
            <span className="ml-1 text-gray-600 dark:text-gray-400 font-mono text-xs">
              | {String(form.getValues().ptoVenta).padStart(3, '0')}-
              {loadingVoucher ? (
                <span className="text-yellow-500">...</span>
              ) : lastVoucherNum !== null ? (
                <span>{String(lastVoucherNum + 1).padStart(4, '0')}</span>
               ) : (
                 <span className="text-red-400" title={voucherErrorMessage ?? undefined}>Error</span>
               )}
            </span>
          )}
        </div>
      </div>

      {voucherErrorMessage && (
        <div role="alert" className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-semibold">No se generó CAE: rechazo de AFIP/ARCA</p>
          <p className="mt-1">{voucherErrorMessage}</p>
          {structuredVoucherError?.code === "11002" && (
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Verifique que el punto esté habilitado para WSFE/WSFEv1 en ARCA.</li>
              <li>Confirme el CUIT y el ambiente del certificado.</li>
              <li>Seleccione un punto habilitado o revise la configuración y vuelva a editar los parámetros.</li>
            </ol>
          )}
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setEditParameters(true)}>
            Editar parámetros
          </Button>
        </div>
      )}

      {/* Condición IVA */}
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
        <span>IVA:</span>
        <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().clientCondition}</span>
      </div>

      {/* CUIT/DNI */}
       {watchClientCondition === ClientConditions.CUIT && form.getValues().documentNumber > 0 && (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <span>CUIT:</span>
          <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().documentNumber}</span>
        </div>
      )}

       {watchClientCondition === ClientConditions.DNI && form.getValues().documentNumber > 0 && (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <span>DNI:</span>
          <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().documentNumber}</span>
        </div>
      )}

      {/* Pago */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/20">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 dark:text-green-400">
          <rect width="20" height="14" x="2" y="5" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
        <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().paidMethod}</span>
      </div>

      {/* Segundo medio */}
      {form.getValues().twoMethods && (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <span>+</span>
          <span className="font-medium">{form.getValues().secondPaidMethod}</span>
        </div>
      )}

      {/* Descuento */}
      {BillState && BillState.discount > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 dark:bg-orange-900/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span className="font-semibold text-orange-600 dark:text-orange-400">-{BillState.discount}%</span>
        </div>
      )}

      {/* Botón editar */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setEditParameters(true)} 
        className="ml-2 rounded-lg h-8 px-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
        Editar
      </Button>
    </div>
  );
};

export default BillParametersForm;
