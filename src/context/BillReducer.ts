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

      if (isPresent) {
        return {
          ...state,
          total: state.total + action.payload.salePrice * action.payload.amount,
          totalWithDiscount:
            state.totalWithDiscount +
            action.payload.salePrice * action.payload.amount * state.discount,
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
            action.payload.salePrice * action.payload.amount * state.discount,
          total: state.total + action.payload.salePrice * action.payload.amount,
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
          action.payload.salePrice * action.payload.amount * state.discount,
        total: state.total + action.payload.salePrice * action.payload.amount,
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
    case "removeItem":
      return {
        ...state,
        products: state.products.filter(
          (product: Product) => product.id !== action.payload.id
        ),
      };
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
        totalWithDiscount: 0,
        pago: false,
        entrega: 0,
        discount: 0,
        typeDocument: "",
        CAE: { CAE: "", nroComprobante: 0, vencimiento: "", qrData: "" },
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
    case "changeUnit":
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
          (acc: number, cur: Product) => acc + cur.salePrice * cur.amount,
          0
        ),
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
    case "updateSalePrice":
      return {
        ...state,
        products: state.products.map((product) => {
          if (product.id === action.payload.id) {
            return { ...product, salePrice: action.payload.salePrice };
          }
          return product;
        }),
      };
    default:
      return state;
  }
};
