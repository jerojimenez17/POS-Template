import { cn } from "@/lib/utils";
interface HeaderProps {
  label: string;
}
export const Header = ({ label }: HeaderProps) => {
  return (
    <div className="w-full flex flex-col gap-y-4 items-center justify-center">
      {label === "Stock" ? (
        <h1 className="text-3xl font-semibold">🛍️ Nuevo Producto</h1>
      ) : (
        <h1 className={cn("text-3xl font-semibold")}>
          🔐POS Demo
        </h1>
      )}
      {label !== "Stock" && (
        <p className="text-muted-foreground text-sm">{label}</p>
      )}
    </div>
  );
};
