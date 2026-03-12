"use client";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Input } from "../ui/input";
import { addDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { doc, runTransaction } from "firebase/firestore";
import moment from "moment";
import { db } from "@/firebase/config";
import BillState from "@/models/BillState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "../ui/dialog";
import Account, { ProductAccount } from "@/models/Account";
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
import { BillContext } from "@/context/BillContext";
import { discountStock } from "@/firebase/orders/newOrder";
import { updateMonthlyRanking } from "@/firebase/stock/updateRanking";

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
  const { removeAll } = useContext(BillContext);
  const [filteredAccounts, setFilteredAccounts] = useState<Account[]>([]);
  const [isPending, startTransition] = useTransition();
  // … otros imports …

  const addProductToAccount = async () => {
    if (!account.id) {
      toast.error("Cuenta inválida");
      return;
    }

    const accountRef = doc(db, "accountLedger", account.id);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Leemos el snapshot actual de la cuenta
        const snapshot = await transaction.get(accountRef);

        if (!snapshot.exists()) {
          throw new Error("La cuenta no existe");
        }

        const data = snapshot.data() as {
          productsAccount: ProductAccount[];
          last_update: Timestamp;
          // otros campos…
        };

        // 2. Construimos los nuevos ProductAccount
        const newProducts = billState.products.map((product) => {
          return new ProductAccount(product, product.amount, moment());
        });

        // 3. Preparamos el array actualizado
        const updatedProductsAccount = [
          ...data.productsAccount,
          ...newProducts.map((pa) => ({
            ...pa,
            date: pa.date.toDate(),
          })),
        ];

        // 4. Hacemos update dentro de la transacción
        transaction.update(accountRef, {
          productsAccount: updatedProductsAccount,
          last_update: moment().toDate(),
        });
      });
      const newProducts = billState.products.map((product) => {
        return new ProductAccount(product, product.amount, moment());
      });
      console.log(newProducts[0].amount);
      newProducts.forEach(async (product) => {
        try {
          await discountStock(product.id, product.amount);
        } catch (err) {
          toast.error("Error al actualizar stock" + err);
        }
      });

      await updateMonthlyRanking(billState.products);
      toast.success("Productos añadidos correctamente");
      removeAll();
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
                  (p) => new ProductAccount(p, p.amount, moment())
                ),
              ],
              acc.date,
              moment()
            )
            : acc
        )
      );
    } catch (error) {
      console.error("Error en transacción:", error);
      toast.error("No se pudieron añadir los productos");
    }
  };

  const addAccount = useCallback(async (account: Account) => {
    try {
      const res = await addDoc(collection(db, "accountLedger"), {
        ...account,
        date: account.date.toDate(),
        last_update: account.last_update.toDate(),
        ...{
          productsAccount: account.productsAccount.map((productAccount) => {
            return {
              ...productAccount,
              date: productAccount.date.toDate(),
            };
          }),
        },
      });
      toast.success("Cuenta creada con éxito");
      setOpenConfirmModal(false);
      await updateMonthlyRanking(billState.products);
      setTimeout(() => {
        setOpenConfirmModal(false);
      }, 300);
      return res;
    } catch (error) {
      console.error(error);

      toast.error("Error al crear cuenta");
    }
  }, [billState.products]);
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "accountLedger"));
        const docs: Account[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          const ac = new Account(
            doc.id,
            data.clientName,
            data.clientEmail,
            data.clientPhone,
            data.productsAccount || [],
            moment(data.date.toDate()),
            moment(data.last_update.toDate())
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
        const productsAccount = billState.products.map((product) => {
          return new ProductAccount(product, product.amount, moment());
        });
        const account = new Account(
          "",
          values.clientName || "",
          values.clientEmail,
          values.clientPhone,
          productsAccount || [],
          moment(),
          moment()
        );
        const resp = await addAccount(account);

        if (resp) {
          toast.success("Cuenta creada con éxito");
          setOpenConfirmModal(false);
          setTimeout(() => {
            setOpenConfirmModal(false);
          }, 800); // Cerrar el modal o hacer cualquier acción posterior
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
              Creado: {account.date.format("DD/MM/YYYY HH:mm")} – Última
              edición: {account.last_update.format("DD/MM/YYYY HH:mm")}
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
    </div>
  );
};

export default AccountLedgerModal;
