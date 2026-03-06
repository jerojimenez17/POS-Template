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
    console.log(BillState);
    setEditParameters(false);
  };
  return editParamters ? (
    <Form {...form}>
      <form className="w-full h-full p-4" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
          {/* Section 1: Bill Type & Client Info */}
          <div className="md:col-span-4 flex flex-col gap-4 p-4 border rounded-xl shadow-sm bg-white">
            <h3 className="font-bold text-lg text-gray-700 mb-2">Datos del Comprobante</h3>
            
            <FormField
              control={form.control}
              name={"billType"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Tipo Factura</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-xl shadow-sm">
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
                  <FormLabel className="font-semibold">Condición IVA</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-xl shadow-sm">
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
                    <FormLabel className="font-semibold">
                      {form.watch("clientCondition") === ClientConditions.CUIT
                        ? ClientConditions.CUIT
                        : ClientConditions.DNI}
                    </FormLabel>
                    <FormControl>
                      <Input
                        className="rounded-xl shadow-sm"
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
          <div className="md:col-span-4 flex flex-col gap-4 p-4 border rounded-xl shadow-sm bg-white">
            <h3 className="font-bold text-lg text-gray-700 mb-2">Forma de Pago</h3>
            
            <FormField
              control={form.control}
              name={"paidMethod"}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold">Medio de Pago Principal</FormLabel>
                  <FormControl>
                    <Select {...field} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full rounded-xl shadow-sm">
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
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Dividir pago en dos medios
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {form.watch("twoMethods") && (
              <div className="flex flex-col gap-4 pl-4 border-l-2 border-slate-200">
                 <FormField
                  control={form.control}
                  name={"secondPaidMethod"}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold">Segundo Medio</FormLabel>
                      <FormControl>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full rounded-xl shadow-sm">
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
                      <FormLabel className="font-semibold">Monto Segundo Medio</FormLabel>
                      <FormControl>
                        <Input
                          className="rounded-xl shadow-sm"
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
          <div className="md:col-span-4 flex flex-col justify-between p-4 border rounded-xl shadow-sm bg-white">
            <div className="flex flex-col gap-4">
              <h3 className="font-bold text-lg text-gray-700 mb-2">Descuentos y Acciones</h3>
              <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold">Descuento Global (%)</FormLabel>
                    <FormControl>
                      <Input
                        className="rounded-xl shadow-sm"
                        {...field}
                        //if the discount is 0 set the value to ""
                        value={field.value === 0 ? "" : field.value}  
                        placeholder={field.value?.toString()}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-4 justify-end mt-8">
              <Button
                className="flex-1 h-12 rounded-xl font-bold bg-green-600 hover:bg-green-700 text-white"
                type="submit"
                variant="default"
              >
                <span className="mr-2">Confirmar</span>
                <span>✔️</span>
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl font-bold bg-red-500 hover:bg-red-600 text-white"
                onClick={(e) => {
                  e.preventDefault(); // Prevent form submission
                  form.reset();
                }}
                variant="default"
              >
                <span className="mr-2">Cancelar</span>
                <span>❌</span>
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  ) : (
    <div
      className={`items-center flex justify-center gap-2 flex-col font-medium`}
    >
      <div>
        <p>Tipo Factura: {form.getValues().billType}</p>
      </div>
      <div>
        <p>Condicion de Cliente: {form.getValues().clientCondition}</p>
      </div>
      {form.getValues().CUIT && (
        <div>
          <p>CUIT: {form.getValues().CUIT}</p>
        </div>
      )}
      <div>
        <p>Medio de Pago: {form.getValues().paidMethod}</p>
      </div>
      {form.getValues().twoMethods && (
        <div>
          <p>Segundo Medio: {form.getValues().secondPaidMethod}</p>
        </div>
      )}

      <div>
        <p>
          Descuento: <span className="font-bold">% </span>
          {form.getValues().discount}
        </p>
      </div>
      <Button variant="ghost" onClick={() => setEditParameters(true)}>
        Editar
      </Button>
    </div>
  );
};

export default BillParametersForm;
