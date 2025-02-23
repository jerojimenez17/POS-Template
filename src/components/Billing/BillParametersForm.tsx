import ClientConditions from "@/models/ClientConditions";
import PaidMethods from "@/models/PaidMethods";
import { BillParametersSchema } from "@/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormControl, FormField, FormItem, FormLabel, Form } from "../ui/form";
import { Select, SelectContent, SelectItem } from "../ui/select";

const BillParametersForm = () => {
  const form = useForm<z.infer<typeof BillParametersSchema>>({
    resolver: zodResolver(BillParametersSchema),
    defaultValues: {
      paidMethod: PaidMethods.EFECTIVO,
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      discount: 0,
      twoMethods: false,
    },
  });
  return (
    <Form {...form}>
      <div>
        <FormField
          control={form.control}
          name={"clientCondition"}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Condicion de Cliente</FormLabel>
              <FormControl>
                <Select>
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
      </div>
    </Form>
  );
};

export default BillParametersForm;
