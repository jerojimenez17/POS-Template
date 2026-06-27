"use client";
import {
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Input } from "../ui/input";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "../ui/dialog";
import Account, { ProductAccount } from "@/models/Account";
import Product from "@/models/Product";
import { DialogDescription } from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { useForm } from "react-hook-form";
import { AccountSchema } from "@/schemas";
import z from "zod";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createLedgerAccountAction,
  getLedgerAccountsAction,
  addProductsToLedgerAction,
} from "@/actions/ledger";
import { FeatureBlockedModal } from "@/components/ui/feature-blocked-modal";
import { parsePlanError } from "@/lib/plan-error";
import BillState from "@/models/BillState";

interface props {
  billState: BillState;
}
const AccountLedgerModal = ({ billState }: props) => {
  const form = useForm<z.infer<typeof AccountSchema>>({
    defaultValues: {
      clientEmail: "",
      clientPhone: "",
    },
    resolver: zodResolver(AccountSchema),
  });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const [openCofirmAddProductModal, setOpenCofirmAddProductModal] =
    useState(false);
  const [account, setAccount] = useState<Account>(new Account());
  const [search, setSearch] = useState("");
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [isPending, startTransition] = useTransition();
  const [planError, setPlanError] = useState<ReturnType<typeof parsePlanError> | null>(null);

  const addProductToAccount = async () => {
    if (!account.id) {
      toast.error("Cuenta inválida");
      return;
    }

    try {
      const products = billState.products.map((product) => ({
        id: product.id,
        code: product.code,
        description: product.description,
        price: product.price,
        salePrice: product.salePrice,
        amount: product.amount,
      }));

      const result = await addProductsToLedgerAction(account.id, products);

      if (result.error) {
        const parsed = parsePlanError(result.error);
        if (parsed.isPlanError) {
          setPlanError(parsed);
        } else {
          toast.error(result.error);
        }
        return;
      }

      toast.success("Productos añadidos correctamente");
      setOpenCofirmAddProductModal(false);

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === account.id
            ? new Account(
                acc.id,
                acc.clientName,
                acc.clientEmail,
                acc.clientPhone,
                [
                  ...acc.productsAccount,
                  ...billState.products.map(
                    (p) => new ProductAccount(p, p.amount, new Date())
                  ),
                ],
                acc.date,
                new Date()
              )
            : acc
        )
      );
    } catch (error) {
      console.error("Error en transacción:", error);
      toast.error("No se pudieron añadir los productos");
    }
  };

  const addAccount = useCallback(async (accountData: Account) => {
    try {
      const products = billState.products.map((product) => ({
        id: product.id,
        code: product.code,
        description: product.description,
        price: product.price,
        salePrice: product.salePrice,
        amount: product.amount,
      }));

      const result = await createLedgerAccountAction({
        clientName: accountData.clientName,
        clientEmail: accountData.clientEmail,
        clientPhone: accountData.clientPhone,
        products,
      });

      if (result.error) {
        const parsed = parsePlanError(result.error);
        if (parsed.isPlanError) {
          setPlanError(parsed);
        } else {
          toast.error(result.error);
        }
        return;
      }

      toast.success("Cuenta creada con éxito");
      setOpenConfirmModal(false);
      setTimeout(() => {
        setOpenConfirmModal(false);
      }, 300);
      return result;
    } catch (error) {
      console.error(error);
      toast.error("Error al crear cuenta");
    }
  }, [billState.products]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const data = await getLedgerAccountsAction();
        const docs: Account[] = data.map((d) => {
          const ac = new Account(
            d.id,
            d.clientName,
            d.clientEmail,
            d.clientPhone,
            d.productsAccount.map(
              (p) => {
                const prod = new Product();
                prod.id = p.id;
                prod.code = p.code;
                prod.description = p.description;
                prod.price = p.price;
                prod.salePrice = p.salePrice;
                return new ProductAccount(prod, p.amount, p.date);
              }
            ),
            d.date,
            d.last_update
          );
          return ac;
        });
        setAccounts(docs);
        setFilteredAccounts(docs);
      } catch (error) {
        console.error("Error al obtener cuentas:", error);
      }
    };

    fetchAccounts();
  }, [addAccount]);

  const onSubmit = async (values: z.infer<typeof AccountSchema>) => {
    startTransition(async () => {
      try {
        const accountData = new Account(
          "",
          values.clientName || "",
          values.clientEmail,
          values.clientPhone,
          [],
          new Date(),
          new Date()
        );
        const resp = await addAccount(accountData);

        if (resp) {
          toast.success("Cuenta creada con éxito");
          setOpenConfirmModal(false);
          setTimeout(() => {
            setOpenConfirmModal(false);
          }, 800);
        }
      } catch (error) {
        console.error(error);
        if (error instanceof Error) {
          toast.error(error.message);
        } else {
          toast.error("Ha ocurrido un error desconocido");
        }
      }
    });
  };

  useEffect(() => {
    const results = accounts.filter((account) =>
      account.clientName.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredAccounts(results);
  }, [search, accounts]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Buscador */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <Input
            className="rounded-lg pl-10 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(e.currentTarget.value);
                if (filteredAccounts.length < 1 && e.currentTarget.value !== "") {
                  setOpenConfirmModal(true);
                }
              }
            }}
          />
        </div>
        <Button
          className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          onClick={() => setOpenConfirmModal(true)}
        >
          Nueva
        </Button>
      </div>

      {/* Lista de cuentas */}
      <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
        {filteredAccounts.length === 0 && search !== "" && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No se encontraron cuentas.
          </p>
        )}
        {filteredAccounts.map((account) => (
          <div
            onClick={() => {
              setOpenCofirmAddProductModal(true);
              setAccount(account);
            }}
            key={account.id}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <p className="font-medium text-gray-900 dark:text-gray-100">{account.clientName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
Creado: {format(account.date, "dd/MM/yyyy HH:mm")} – Última
               edición: {format(account.last_update, "dd/MM/yyyy HH:mm")}
             </p>
          </div>
        ))}
      </div>

      {/* Modal: Crear nueva cuenta */}
      <Dialog
        open={openConfirmModal}
        onOpenChange={(open) => setOpenConfirmModal(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar añadir cuenta a {search}</DialogTitle>
            <DialogDescription>
              Añadir información de contacto (uno es obligatorio)
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} 
            className="space-y-4">
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={search || ""}
                        placeholder="Juan Perez"
                        type="text"
                        className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        autoComplete="clientName"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deliveryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de quien retira (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Juan Perez"
                        type="text"
                        className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        autoComplete="deliveryName"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="223485565"
                        type="text"
                        className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        autoComplete="clientPhone"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="email@ejemplo.com"
                        type="text"
                        className="rounded-lg bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                        autoComplete="clientEmail"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  {isPending ? "Guardando..." : "Confirmar"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar añadir productos */}
      <Dialog
        open={openCofirmAddProductModal}
        onOpenChange={(open) => setOpenCofirmAddProductModal(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Añadir a {account.clientName}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            ¿Está seguro que desea añadir los productos a esta cuenta?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-lg">
                Cancelar
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={async () => await addProductToAccount()}
                className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Confirmar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FeatureBlockedModal
        open={!!planError}
        onOpenChange={(open) => {
          if (!open) setPlanError(null);
        }}
        variant={planError?.variant ?? "feature"}
        feature={planError?.feature}
        resource={planError?.resource}
        limitValue={planError?.limitValue}
        showAcknowledge={false}
      />
    </div>
  );
};

export default AccountLedgerModal;
