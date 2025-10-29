import Account from "@/models/Account";

interface Props {
  account: Account;
  onClick: () => void;
}

const AccountCard = ({ account, onClick }: Props) => {
  return (
    <div
      onClick={onClick}
      className="border p-4 rounded-lg dark:bg-gray-700 dark:text-gray-100 shadow hover:bg-muted cursor-pointer"
    >
      <h2 className="font-semibold text-lg">{account.clientName}</h2>
      <p className="text-sm text-muted-foreground">{account.clientEmail}</p>
      <p className="text-sm mt-1">
        Total:{" "}
        <strong>
          $
          {account.total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </strong>
      </p>
      <p className="text-xs text-gray-500 mt-1">
        Última actualización: {account.last_update.format("DD/MM/YYYY HH:mm")}
      </p>
    </div>
  );
};

export default AccountCard;
