enum ClientConditions {
  CONSUMIDOR_FINAL = "Consumidor Final",
  RESPONSABLE_INSCRIPTO = "Responsable Inscripto",
  MONOTRIBUTISTA = "Monotributista",
  EXENTO = "Exento",
}
export default ClientConditions;
export const ClientConditionValues = [
  ClientConditions.CONSUMIDOR_FINAL,
  ClientConditions.RESPONSABLE_INSCRIPTO,
  ClientConditions.MONOTRIBUTISTA,
  ClientConditions.EXENTO,
] as const;
export type ClientConditionType = typeof ClientConditionValues[number];
