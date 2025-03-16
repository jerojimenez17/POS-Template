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
  | { type: "disableEndDate"; payload: null };

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
    default:
      return state;
  }
};
