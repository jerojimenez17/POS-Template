import FiltersState from "@/models/FiltersState";

type FiltersAction =
  | { type: "switchRemito"; payload: null }
  | { type: "switchFacturaC"; payload: null }
  | { type: "switchDebito"; payload: null }
  | { type: "switchUnPago"; payload: null }
  | { type: "switchAhora3"; payload: null }
  | { type: "switchAhora6"; payload: null }
  | { type: "switchTransferencia"; payload: null }
  | { type: "switchCuentaDNI"; payload: null }
  | { type: "switchEfectivo"; payload: null }
  | { type: "startDate"; payload: Date }
  | { type: "endDate"; payload: Date }
  | { type: "disableStartDate"; payload: null }
  | { type: "seller"; payload: string }
  | { type: "disableSeller"; payload: null }
  | { type: "disableEndDate"; payload: null }
  | { type: "reset"; payload: null }
  | { type: "initFromUrl"; payload: { startDate?: Date; endDate?: Date; showAll?: boolean } };

export const FiltersReducer = (
  state: FiltersState,
  action: FiltersAction
): FiltersState => {
  switch (action.type) {
    case "switchFacturaC":
      return {
        ...state,
        FacturaC: {
          ...state.FacturaC,
          active: !state.FacturaC.active,
        },
      };

    case "seller":
      if (state.Seller.filter === action.payload && state.Seller.active === true) {
        return state;
      }
      return {
        ...state,
        Seller: {
          active: true,
          filter: action.payload,
        },
      };
    case "disableSeller":
      return {
        ...state,
        Seller: {
          active: false,
          filter: "",
        },
      };
    case "switchRemito":
      return {
        ...state,
        Remito: {
          ...state.Remito,
          active: !state.Remito.active,
        },
      };
    case "switchDebito":
      return {
        ...state,
        Debito: {
          ...state.Debito,
          active: !state.Debito.active,
        },
      };
    case "switchUnPago":
      return {
        ...state,
        UnPago: {
          ...state.UnPago,
          active: !state.UnPago.active,
        },
      };
    case "switchAhora3":
      return {
        ...state,
        Ahora3: {
          ...state.Ahora3,
          active: !state.Ahora3.active,
        },
      };
    case "switchAhora6":
      return {
        ...state,
        Ahora6: {
          ...state.Ahora6,
          active: !state.Ahora6.active,
        },
      };
    case "switchTransferencia":
      return {
        ...state,
        Transferencia: {
          ...state.Transferencia,
          active: !state.Transferencia.active,
        },
      };
    case "switchCuentaDNI":
      return {
        ...state,
        CuentaDNI: {
          ...state.CuentaDNI,
          active: !state.CuentaDNI.active,
        },
      };
    case "switchEfectivo":
      return {
        ...state,
        Efectivo: {
          ...state.Efectivo,
          active: !state.Efectivo.active,
        },
      };
    case "startDate":
      console.log(action.payload);
      return {
        ...state,
        startDate: {
          active: true,
          date: action.payload,
        },
      };
    case "endDate":
      return {
        ...state,
        endDate: {
          active: true,
          date: action.payload,
        },
      };
    case "disableStartDate":
      return {
        ...state,
        startDate: {
          ...state.startDate,
          active: false,
        },
      };
    case "disableEndDate":
      return {
        ...state,
        endDate: {
          ...state.endDate,
          active: false,
        },
      };
    case "initFromUrl": {
      const newState = { ...state };

      if (action.payload.startDate) {
        newState.startDate = { active: true, date: action.payload.startDate };
      }
      if (action.payload.endDate) {
        newState.endDate = { active: true, date: action.payload.endDate };
      }

      if (action.payload.showAll) {
        // Desactivar todos los medios de pago para mostrar todo
        newState.Efectivo = { ...newState.Efectivo, active: false };
        newState.Debito = { ...newState.Debito, active: false };
        newState.UnPago = { ...newState.UnPago, active: false };
        newState.Ahora3 = { ...newState.Ahora3, active: false };
        newState.Ahora6 = { ...newState.Ahora6, active: false };
        newState.Transferencia = { ...newState.Transferencia, active: false };
        newState.CuentaDNI = { ...newState.CuentaDNI, active: false };
        // Mostrar ambos tipos de comprobante
        newState.Remito = { ...newState.Remito, active: true };
        newState.FacturaC = { ...newState.FacturaC, active: true };
        // Desactivar filtro de vendedor
        newState.Seller = { ...newState.Seller, active: false };
      }

      return newState;
    }
    default:
      return state;

    case "reset":
      const now = new Date();
      const resetStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const resetEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return {
        Remito: { active: true, filter: "remito" },
        Seller: { active: false, filter: "Seleccionar Vendedor" },
        FacturaC: { active: false, filter: "facturac" },
        Debito: { active: false, filter: "debito" },
        UnPago: { active: false, filter: "Credito 1 pago" },
        Ahora3: { active: false, filter: "ahora 3" },
        Ahora6: { active: false, filter: "ahora 6" },
        Transferencia: { active: false, filter: "transferencia" },
        Efectivo: { active: true, filter: "efectivo" },
        CuentaDNI: { active: false, filter: "cuentaDNI" },
        startDate: { active: true, date: resetStart },
        endDate: { active: true, date: resetEnd },
      };
  }
};
