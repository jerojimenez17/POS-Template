// import CartState from "../interfaces/CartState";
import Order from "@/models/Order";
import Product from "@/models/Product";

type CartAction =
  | { type: "addItem"; payload: Product }
  | { type: "addUnit"; payload: Product }
  | { type: "removeUnit"; payload: { id: string } }
  | { type: "removeAll"; payload: null }
  | { type: "removeItem"; payload: { id: string } }
  | { type: "updateAmount"; payload: { id: string } }
  | { type: "updateTotal"; payload: Product }
  | { type: "changePrice"; payload: Product }
  | { type: "changeAmount"; payload: Product }
  | { type: "total"; payload: null }
  | { type: "discount"; payload: number }
  // | { type: "typeDocument"; payload: string }
  // | { type: "documentNumber"; payload: number }
  | { type: "entrega"; payload: number }
  // | { type: "nroAsociado"; payload: number }
  // | { type: "clientName"; payload: string }
  // | { type: "IVACondition"; payload: string }
  // | { type: "tipoFactura"; payload: string }
  // | { type: "CAE"; payload: CAE }
  | { type: "setState"; payload: Order };

export const CartReducer = (state: Order, action: CartAction): Order => {
  switch (action.type) {
    case "addItem":
      if (state.products.find((product) => product.id === action.payload.id)) {
        return {
          ...state,
          products: state.products.map((product) => {
            if (product.id === action.payload.id) {
              const cant = product.amount;
              console.log(product.amount + cant);
              return {
                ...product,
                amount: action.payload.amount + cant,
              };
            }
            return product;
          }),
        };
      } else {
        return {
          ...state,
          products: state.products.concat({
            ...action.payload,
          }),
        };
      }
    case "addUnit":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id && product.amount) {
            product.amount++;
          }
          return product;
        }),
      };
    case "removeUnit":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (
            product.id === action.payload.id &&
            product.amount &&
            product.amount > 1
          ) {
            product.amount = product.amount - 1;
          }

          return product;
        }),
      };
    case "removeItem":
      return {
        ...state,
        products: state.products.filter(
          (product) => product.id !== action.payload.id
        ),
      };
    case "removeAll":
      return {
        ...state,
        products: [],
      };
    case "changePrice":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id) {
            product.price = action.payload.price;
          }

          return product;
        }),
      };
    case "changeAmount":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id) {
            product.amount = action.payload.amount;
          }

          return product;
        }),
      };
    case "total":
      return {
        ...state,
        total: state.products.reduce(
          (acc, cur) => acc + (cur.price ?? 0) * (cur.amount ?? 0),
          0
        ),
      };
    // case "discount":
    //   return {
    //     ...state,
    //     totalWithDiscount: state.total - state.total * action.payload * 0.01,
    //   };
    // case "clientName":
    //   return {
    //     ...state,
    //     client: action.payload,
    //   };
    // case "entrega":
    //   return {
    //     ...state,
    //     entrega: action.payload,
    //   };
    // case "typeDocument":
    //   return {
    //     ...state,
    //     typeDocument: action.payload,
    //   };
    // case "tipoFactura":
    //   return {
    //     ...state,
    //     tipoFactura: action.payload,
    //   };
    // case "documentNumber": {
    //   return {
    //     ...state,
    //     documentNumber: action.payload,
    //   };
    // }
    // case "nroAsociado": {
    //   return {
    //     ...state,
    //     nroAsociado: action.payload,
    //   };
    // }
    // case "IVACondition": {
    //   return {
    //     ...state,
    //     IVACondition: action.payload,
    //   };
    // }
    // case "CAE": {
    //   return {
    //     ...state,
    //     CAE: action.payload,
    //   };
    // }
    case "setState": {
      state = action.payload;
      return {
        ...state,
        // CAE: action.payload.CAE,
        // IVACondition: action.payload.IVACondition,
        // tipoFactura: action.payload.tipoFactura,
        // documentNumber: action.payload.documentNumber,
        // typeDocument: action.payload.typeDocument,
      };
    }
    default:
      return state;
  }
};
