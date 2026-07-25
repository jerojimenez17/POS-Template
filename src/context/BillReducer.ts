import BillState from "@/models/BillState";
import Product from "@/models/Product";
import type { BillAction } from "./billActions";

export const BillReducer = (
  state: BillState,
  action: BillAction
): BillState => {
  switch (action.type) {
    case "addItem":
      const isPresent = state.products.find(
        (product) => product.id === action.payload.id
      );

      const itemTotal = action.payload.salePrice * action.payload.amount;
      if (isPresent) {
        return {
          ...state,
          total: state.total + itemTotal,
          totalWithDiscount:
            state.totalWithDiscount +
            itemTotal * (1 - state.discount * 0.01),
          products: state.products.map((product) => {
            if (product.id === action.payload.id) {
              return {
                ...product,
                amount: product.amount + action.payload.amount,
              };
            } else {
              return product;
            }
          }),
        };
      } else {
        return {
          ...state,
          totalWithDiscount:
            state.totalWithDiscount +
            itemTotal * (1 - state.discount * 0.01),
          total: state.total + itemTotal,
          products: state.products.concat({
            ...action.payload,
          }),
        };
      }
    case "addUnit":
      return {
        ...state,
        totalWithDiscount:
          state.totalWithDiscount +
          action.payload.salePrice * (1 - state.discount * 0.01),
        total: state.total + action.payload.salePrice,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id) {
            product.amount++;
          }
          return product;
        }),
      };
    case "removeUnit":
      return {
        ...state,
        products: state.products.map(({ ...product }) => {
          if (product.id === action.payload.id && product.amount > 1) {
            product.amount = product.amount - 1;
          }

          return product;
        }),
      };
    case "removeItem": {
      const filtered = state.products.filter(
        (product: Product) => product.id !== action.payload.id
      );
      const recalculatedTotal = filtered.reduce(
        (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        products: filtered,
        total: recalculatedTotal,
        totalWithDiscount: recalculatedTotal * (1 - (state.discount || 0) * 0.01),
      };
    }
    case "removeAll":
      return {
        ...state,
        products: [],
        documentNumber: 0,
        billType: "Factura C",
        IVACondition: "Consumidor Final",
        nroAsociado: 0,
        total: 0,
        date: new Date(),
        paidMethod: "Efectivo",
        twoMethods: false,
        secondPaidMethod: undefined,
        totalSecondMethod: null,
        totalWithDiscount: 0,
        pago: false,
        entrega: 0,
        discount: 0,
        typeDocument: "",
        CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
      };
    case "changePrice": {
      const priceChanged = state.products.map(({ ...product }) => {
        if (product.id === action.payload.id) {
          product.price = action.payload.price;
        }
        return product;
      });
      const priceTotal = priceChanged.reduce(
        (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        products: priceChanged,
        total: priceTotal,
        totalWithDiscount: priceTotal * (1 - (state.discount || 0) * 0.01),
      };
    }
    case "changeUnit": {
      const unitChanged = state.products.map(({ ...product }) => {
        if (product.id === action.payload.id) {
          product.amount = action.payload.amount;
        }
        return product;
      });
      const unitTotal = unitChanged.reduce(
        (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        products: unitChanged,
        total: unitTotal,
        totalWithDiscount: unitTotal * (1 - (state.discount || 0) * 0.01),
      };
    }
    case "total":
      const recalculated = state.products.reduce(
        (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        total: recalculated,
        totalWithDiscount: recalculated * (1 - (state.discount || 0) * 0.01),
      };
    case "discount":
      return {
        ...state,
        discount: action.payload,
        totalWithDiscount:
          state.products.reduce(
            (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
            0
          ) -
          state.products.reduce(
            (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
            0
          ) *
            action.payload *
            0.01,
      };
    case "sellerName":
      return {
        ...state,
        seller: action.payload,
      };
    case "entrega":
      return {
        ...state,
        entrega: action.payload,
      };
    case "typeDocument":
      return {
        ...state,
        typeDocument: action.payload,
      };
    case "billType":
      return {
        ...state,
        billType: action.payload,
      };
    case "documentNumber": {
      return {
        ...state,
        documentNumber: action.payload,
      };
    }
    case "nroAsociado": {
      return {
        ...state,
        nroAsociado: action.payload,
      };
    }
    case "IVACondition": {
      return {
        ...state,
        IVACondition: action.payload,
      };
    }
    case "paidMethod": {
      return {
        ...state,
        paidMethod: action.payload,
      };
    }
    case "CAE": {
      console.log("Modificando CAE");
      return {
        ...state,
        CAE: { ...action.payload },
      };
    }
    case "date": {
      return {
        ...state,
        date: action.payload,
      };
    }
    case "clientId": {
      return {
        ...state,
        clientId: action.payload,
      };
    }
    case "client": {
      return {
        ...state,
        client: action.payload,
      };
    }
    case "updateSalePrice": {
      const { id, salePrice } = action.payload;
      const updatedProducts = state.products.map((product) =>
        product.id === id ? { ...product, salePrice } : product
      );
      const newTotal = updatedProducts.reduce(
        (acc, cur) => acc + cur.salePrice * cur.amount,
        0
      );
      return {
        ...state,
        products: updatedProducts,
        total: newTotal,
        totalWithDiscount: newTotal * (1 - (state.discount || 0) * 0.01),
      };
    }
    case "setState": {
      state = action.payload;
      return {
        ...state,
        CAE: action.payload.CAE,
        IVACondition: action.payload.IVACondition,
        billType: action.payload.billType,
        documentNumber: action.payload.documentNumber,
        typeDocument: action.payload.typeDocument,
      };
    }
    default:
      return state;
  }
};
