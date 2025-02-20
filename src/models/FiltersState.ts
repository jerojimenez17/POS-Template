import FilterField from "./FilterField";

export default interface FilterState {
  FacturaC: FilterField;
  Remito: FilterField;
  Debito: FilterField;
  UnPago: FilterField;
  Ahora3: FilterField;
  Ahora6: FilterField;
  Transferencia: FilterField;
  CuentaDNI: FilterField;
  Efectivo: FilterField;
  Seller: FilterField;
  startDate: { active: boolean; date: Date };
  endDate: { active: boolean; date: Date };
}
