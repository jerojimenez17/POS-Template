import Account from "@/models/Account";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  account: Account;
  onClose: () => void;
}

const AccountDetail = ({ account, onClose }: Props) => {
  return (
    <Dialog open onOpenChange={onClose} modal={true}>
      <DialogContent className="size-full">
        <DialogHeader>
          <DialogTitle>Detalle de Cuenta – {account.clientName}</DialogTitle>
        </DialogHeader>

        <div className="dark:bg-gray-700 dark:text-gray-100 shadow">
          <p>Email: {account.clientEmail || "No especificado"}</p>
          <p>Teléfono: {account.clientPhone || "No especificado"}</p>
          <p>Productos: {account.productsAccount.length}</p>
          <p>Creada: {format(account.date, "dd/MM/yyyy HH:mm")}</p>
          <p>
            Última actualización:{" "}
            {format(account.last_update, "dd/MM/yyyy HH:mm")}
          </p>
          <p>Productos:</p>
          <ul className="list-disc list-inside">
            {account.productsAccount.map((productAccount) => (
              <li key={productAccount.id}>
                {productAccount.code} - {productAccount.description} -
                {"Fecha de retiro: "}
                {format(productAccount.date, "dd/MM/yyyy HH:mm")}
              </li>
            ))}
          </ul>
          <p className="font-semibold">
            Total: $
            {account.total.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        <DialogClose asChild>
          <Button variant="outline">Cerrar</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
};

export default AccountDetail;
