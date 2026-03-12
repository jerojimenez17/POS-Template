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
import { useContext, useMemo, useState } from "react";
import { BillContext } from "@/context/BillContext";
import BillTypes from "@/models/billType";

const BillParametersForm = () => {
  const [editParamters, setEditParameters] = useState(false);
  const { setState, BillState } = useContext(BillContext);

  const form = useForm<z.infer<typeof BillParametersSchema>>({
    resolver: zodResolver(BillParametersSchema),
    defaultValues: {
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
      billType: BillTypes.C,
      totalSecondMethod: 0,
      secondPaidMethod: PaidMethods.DEBITO,
    },
  });
  const currentDate = useMemo(() => new Date(), []);

  const onSubmit = () => {
    setState({
      ...form.getValues(),
      id: "",
      products: BillState.products,
      total: BillState.total,
      totalWithDiscount: BillState.totalWithDiscount,
      seller: BillState.seller,
      billType: form.getValues().billType,
      date: currentDate,
      typeDocument: form.getValues().clientCondition,
      documentNumber: form.getValues().DNI ?? 0,
      IVACondition: form.getValues().clientCondition,
    });
    
    setEditParameters(false);
  };
  return editParamters ? (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Grid de 3 columnas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
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
                    <Select {...field} onValueChange={field.onChange}>
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

              {form.watch("clientCondition") !== ClientConditions.CONSUMIDOR_FINAL && (
                <FormField
                  control={form.control}
                  name={
                    form.watch("clientCondition") === ClientConditions.CUIT
                      ? ClientConditions.CUIT
                      : ClientConditions.DNI
                  }
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm text-gray-600 dark:text-gray-300">
                        {form.watch("clientCondition") === ClientConditions.CUIT
                          ? "CUIT"
                          : "DNI"}
                      </FormLabel>
                      <Input
                        className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        {...field}
                        placeholder={field.value?.toString() || "0"}
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

          {/* Descuento */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              Descuento
            </div>
            
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm text-gray-600 dark:text-gray-300">Porcentaje (%)</FormLabel>
                    <div className="relative">
                      <Input
                        className="h-11 rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 pr-10"
                        {...field}
                        value={field.value === 0 ? "" : field.value}
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                    </div>
                  </FormItem>
                )}
              />

              {/* Preview del descuento */}
              {form.watch("discount") > 0 && (
                <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span className="text-orange-700 dark:text-orange-400 font-medium">
                      -{form.watch("discount")}% de descuento aplicado
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
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
      {/* Comprobante */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span className="font-semibold text-gray-700 dark:text-gray-300">{form.getValues().billType}</span>
        </div>
      </div>

      {/* Condición IVA */}
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
        <span>IVA:</span>
        <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().clientCondition}</span>
      </div>

      {/* CUIT/DNI */}
      {form.getValues().CUIT && (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <span>CUIT:</span>
          <span className="font-medium text-gray-900 dark:text-gray-200">{form.getValues().CUIT}</span>
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
      {form.getValues().discount > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-50 dark:bg-orange-900/20">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span className="font-semibold text-orange-600 dark:text-orange-400">-{form.getValues().discount}%</span>
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
