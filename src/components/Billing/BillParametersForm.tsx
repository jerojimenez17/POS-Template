"use client";
import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { BillParametersSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormControl, FormField, FormItem, FormLabel, Form } from "../ui/form";
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
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Section 1: Bill Type & Client Info */}
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Comprobante</h3>
            
            <FormField
              control={form.control}
              name={"billType"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Tipo Factura</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
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
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={"clientCondition"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Condición IVA</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
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
                  </FormControl>
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
                    <FormLabel className="text-sm font-medium">
                      {form.watch("clientCondition") === ClientConditions.CUIT
                        ? ClientConditions.CUIT
                        : ClientConditions.DNI}
                    </FormLabel>
                    <FormControl>
                      <Input
                        className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        {...field}
                        placeholder={field.value?.toString() || "0"}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>

          {/* Section 2: Payment Methods */}
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pago</h3>
            
            <FormField
              control={form.control}
              name={"paidMethod"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Medio Principal</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
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
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={"twoMethods"}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 rounded-lg border p-3 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="text-sm cursor-pointer">
                    Dividir pago
                  </FormLabel>
                </FormItem>
              )}
            />

            {form.watch("twoMethods") && (
              <div className="flex flex-col gap-3 pl-4 border-l-2 border-gray-300 dark:border-gray-500">
                 <FormField
                  control={form.control}
                  name={"secondPaidMethod"}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Segundo Medio</FormLabel>
                      <FormControl>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
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
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalSecondMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Monto</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                          placeholder={field.value?.toString()}
                          {...field}
                          onChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </div>

          {/* Section 3: Actions & Discounts */}
          <div className="flex flex-col gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descuento</h3>
            
            <FormField
              control={form.control}
              name="discount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Descuento (%)</FormLabel>
                  <FormControl>
                    <Input
                      className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                      {...field}
                      value={field.value === 0 ? "" : field.value}  
                      placeholder="0"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-3 mt-auto pt-4">
              <Button
                className="flex-1 h-10 rounded-lg font-medium bg-slate-900 hover:bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                type="submit"
              >
                Confirmar
              </Button>
              <Button
                className="flex-1 h-10 rounded-lg font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-gray-100 dark:border-gray-600"
                onClick={(e) => {
                  e.preventDefault();
                  form.reset();
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  ) : (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">Factura:</span>
        <span className="font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{form.getValues().billType}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">IVA:</span>
        <span className="font-medium">{form.getValues().clientCondition}</span>
      </div>
      {form.getValues().CUIT && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">CUIT:</span>
          <span className="font-medium">{form.getValues().CUIT}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">Pago:</span>
        <span className="font-medium">{form.getValues().paidMethod}</span>
      </div>
      {form.getValues().twoMethods && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">+</span>
          <span className="font-medium">{form.getValues().secondPaidMethod}</span>
        </div>
      )}
      {form.getValues().discount > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400">Desc:</span>
          <span className="font-medium text-green-600 dark:text-green-400">-{form.getValues().discount}%</span>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => setEditParameters(true)} className="ml-2 rounded-lg">
        Editar
      </Button>
    </div>
  );
};

export default BillParametersForm;
