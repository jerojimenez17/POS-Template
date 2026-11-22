import { Sequence } from "remotion";
import { BrandReveal } from "./scenes/BrandReveal";
import { CheckoutScene } from "./scenes/CheckoutScene";
import { CatalogScene } from "./scenes/CatalogScene";
import { InventoryScene } from "./scenes/InventoryScene";
import { AccountLedgerScene } from "./scenes/AccountLedgerScene";
import { OperationsScene } from "./scenes/OperationsScene";
import { ClosingScene } from "./scenes/ClosingScene";

export const StockShowcase = () => (
  <>
    <Sequence name="01 · Marca" durationInFrames={120}>
      <BrandReveal />
    </Sequence>
    <Sequence name="02 · Venta en mostrador" from={120} durationInFrames={300}>
      <CheckoutScene />
    </Sequence>
    <Sequence name="03 · Catálogo digital público" from={420} durationInFrames={300}>
      <CatalogScene />
    </Sequence>
    <Sequence name="04 · Inventario" from={720} durationInFrames={240}>
      <InventoryScene />
    </Sequence>
    <Sequence name="05 · Cuenta Corriente" from={960} durationInFrames={300}>
      <AccountLedgerScene />
    </Sequence>
    <Sequence name="06 · Operación" from={1260} durationInFrames={240}>
      <OperationsScene />
    </Sequence>
    <Sequence name="07 · Cierre" from={1500} durationInFrames={120}>
      <ClosingScene />
    </Sequence>
  </>
);
