import Account from "@/models/Account";
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

        <div className="space-y-2">
          <p>Email: {account.clientEmail || "No especificado"}</p>
          <p>Teléfono: {account.clientPhone || "No especificado"}</p>
          <p>Productos: {account.productsAccount.length}</p>
          <p>Creada: {account.date.format("DD/MM/YYYY HH:mm")}</p>
          <p>
            Última actualización:{" "}
            {account.last_update.format("DD/MM/YYYY HH:mm")}
          </p>
          <p>Productos:</p>
          <ul className="list-disc list-inside">
            {account.productsAccount.map((productAccount) => (
              <li key={productAccount.id}>
                {productAccount.code} - {productAccount.description} -
                {"Fecha de retiro: "}
                {productAccount.date.format("DD/MM/YYYY HH:mm")}
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
