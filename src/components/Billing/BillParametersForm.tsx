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
      <form className="size-full" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="size-full flex gap-2 flex-col">
          <div className=" text-gray-700 container items-center flex-col md:flex-row size-full justify-evenly mx-auto gap-1 flex">
            <div className=" mx-auto w-full md:w-1/3 h-1/2 md:h-full my-auto gap-0 flex flex-col">
              <div className="h-full w-full text-center my-auto flex items-center">
                <FormField
                  control={form.control}
                  name={"billType"}
                  render={({ field }) => (
                    <FormItem className="w-1/2 md:w-1/3 mx-auto">
                      <FormLabel className=" font-semibold">
                        Tipo Factura
                      </FormLabel>
                      <FormControl>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="rounded-xl shadow-md w-full mx-auto">
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
              </div>
              <div className="h-full w-full text-center my-auto flex items-center">
                <FormField
                  control={form.control}
                  name={"clientCondition"}
                  render={({ field }) => (
                    <FormItem className="w-1/2 md:w-1/3 mx-auto">
                      <FormLabel className=" font-semibold">
                        Condicion de Cliente
                      </FormLabel>
                      <FormControl>
                        <Select {...field} onValueChange={field.onChange}>
                          <SelectTrigger className="rounded-xl shadow-md w-full mx-auto">
                            <SelectValue placeholder={field.value} />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(ClientConditions).map(
                              (condition) => (
                                <SelectItem key={condition} value={condition}>
                                  {condition}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              {/* Nuevo campo de texto */}
              {form.watch("clientCondition") !==
                ClientConditions.CONSUMIDOR_FINAL && (
                <div className=" w-full mb-2 mx-auto">
                  <FormField
                    control={form.control}
                    name={
                      form.watch("clientCondition") === ClientConditions.CUIT
                        ? ClientConditions.CUIT
                        : ClientConditions.DNI
                    }
                    render={({ field }) => (
                      <FormItem className="h-1/2 w-1/2 md:w-1/3 text-center mx-auto">
                        <FormLabel className=" font-semibold">
                          {form.watch("clientCondition") ===
                          ClientConditions.CUIT
                            ? ClientConditions.CUIT
                            : ClientConditions.DNI}
                        </FormLabel>
                        <FormControl>
                          <Input
                            className="rounded-xl shadow-md"
                            {...field}
                            placeholder={field.value?.toString() || "0"}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
            <div className="w-full md:w-1/3 flex mx-auto my-auto">
              <FormField
                control={form.control}
                name={"paidMethod"}
                render={({ field }) => (
                  <FormItem className="w-full items-center text-center mx-auto">
                    <FormLabel className="font-semibold">
                      Medio de Pago
                    </FormLabel>
                    <FormControl>
                      <Select {...field} onValueChange={field.onChange}>
                        <SelectTrigger className="md:w-1/3 shadow-md w-1/2 mx-auto rounded-xl">
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
            </div>

            <div className="w-1/3 md:w-1/3 h-full my-auto flex flex-col align-middle">
              <div className="my-auto">
                <FormField
                  control={form.control}
                  name={"twoMethods"}
                  render={({ field }) => (
                    <FormItem className="space-x-1 text-center">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className=" font-semibold text-sm">
                        Dos medios de pago
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              {form.watch("twoMethods") && (
                <div className="flex size-full">
                  <div className=" text-center items-center mx-auto ">
                    <FormField
                      control={form.control}
                      name={"secondPaidMethod"}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">
                            Segundo Medio
                          </FormLabel>
                          <FormControl>
                            <Select {...field} onValueChange={field.onChange}>
                              <SelectTrigger className="rounded-xl shadow-md">
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
                  </div>
                  <div className="mx-auto ">
                    <FormField
                      control={form.control}
                      name="totalSecondMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold">
                            Total Segundo Metodo
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="rounded-xl shadow-md"
                              placeholder={field.value?.toString()}
                              {...field}
                              onChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="mx-auto text-center w-1/5 ">
              <FormField
                control={form.control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className=" font-semibold">Descuento</FormLabel>
                    <FormControl>
                      <Input
                        className="rounded-xl mx-auto w-3/4 shadow-md"
                        placeholder={field.value?.toString()}
                        {...field}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="flex w-full gap-1 justify-center">
            <Button
              className="w-12 rounded-xl pb-3 px-4 font-bold"
              type="submit"
              variant="default"
            >
              <span className="text-lg">✔️</span>
            </Button>
            <Button
              className="w-12 rounded-xl px-4 font-bold"
              onClick={() => {
                form.reset();
              }}
              variant="default"
            >
              ❌
            </Button>
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
