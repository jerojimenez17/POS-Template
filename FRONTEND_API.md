# Frontend API — ARCA/AFIP Cloud Functions

Documentación para consumir las Cloud Functions de este proyecto desde el frontend.

---

## Cómo usar

### Opción 1 (recomendada) — Copiar el cliente

Copiar `src/frontend-api/client.ts` al proyecto frontend e importar:

```ts
import { arcaClient } from "./client";

const res = await arcaClient.getLastVoucher({
  baseUrl: "https://us-central1-<project>.cloudfunctions.net",
  internalKey: "<INTERNAL_AFIP_API_KEY>",
  puntoVenta: 1,
  tipoFactura: 1,
});
```

Cada función retorna un `ApiResult<T>` con discriminador `success`:

```ts
type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: { error: string; details?: any } };
```

### Opción 2 — Llamadas directas con fetch

Todas las funciones son `POST` con el header `x-internal-key`.

---

## Endpoints

### 1. Obtener último comprobante

**Handler:** `getLastVoucherHandler`

Obtiene el número del último comprobante emitido para un punto de venta y tipo de factura. Se usa para calcular el número del próximo comprobante.

**Request:**

```json
{
  "puntoVenta": 1,
  "tipoFactura": 1,
  "accessToken": "opcional-si-no-se-usa-cert",
  "encryptedCert": "opcional",
  "encryptedKey": "opcional"
}
```

**Tipos de factura:**

| Valor | Tipo           |
|-------|----------------|
| 1     | Factura A      |
| 3     | Nota Crédito A |
| 6     | Factura B      |
| 8     | Nota Crédito B |
| 11    | Factura C      |
| 13    | Nota Crédito C |

**Response:**

```json
{
  "lastVoucher": 42
}
```

---

### 2. Obtener certificados de testing (dev)

**Handler:** `getArcaTestCertsHandler`

Genera certificados de prueba a través de la automatización `create-cert-dev` de ARCA.

**Request:**

```json
{
  "cuit": "20111111112",
  "username": "20111111112",
  "password": "contraseña",
  "alias": "afipsdk",
  "accessToken": "opcional"
}
```

**Response:**

```json
{
  "cert": "-----BEGIN CERTIFICATE-----...",
  "key": "-----BEGIN RSA PRIVATE KEY-----..."
}
```

---

### 3. Obtener certificados de producción

**Handler:** `createCertProdHandler`

Genera certificados de producción a través de la automatización `create-cert-prod` de ARCA.

**Request:**

```json
{
  "cuit": "20111111112",
  "username": "20111111112",
  "password": "contraseña",
  "alias": "afipsdk",
  "accessToken": "opcional"
}
```

**Response:**

```json
{
  "cert": "-----BEGIN CERTIFICATE-----...",
  "key": "-----BEGIN RSA PRIVATE KEY-----..."
}
```

---

### 4. Crear comprobante / Factura electrónica

**Handler:** `createAFIPVoucher`

Crea un comprobante electrónico (Factura A, B, C o Nota de Crédito).

**Request:**

```json
{
  "encryptedCert": "opcional",
  "encryptedKey": "opcional",
  "arca": {
    "cuit": "20393425920",
    "accessToken": "opcional",
    "puntoVenta": 1,
    "condicionIva": "RESPONSABLE_INSCRIPTO",
    "razonSocial": "Razon Social",
    "inicioActividades": "2024-01-01",
    "address": "Dirección"
  },
  "billState": {
    "billType": "Factura A",
    "typeDocument": "CUIT",
    "documentNumber": 20123456789,
    "IVACondition": "Responsable Inscripto",
    "products": [
      { "price": 1000, "amount": 2 }
    ],
    "discount": 0,
    "nroAsociado": 0
  }
}
```

**Campos importantes:**

| Campo                  | Descripción                                         |
|------------------------|-----------------------------------------------------|
| `billType`             | `"Factura A"` / `"Factura B"` / `"Factura C"`       |
| `typeDocument`         | `"CUIT"` / `"DNI"` / `"CUIL"` / `""`                |
| `IVACondition`         | Condición fiscal del comprador                       |
| `products`             | Array de `{ price, amount }` — el total = ∑(p * q)   |
| `discount`             | Descuento porcentual (0-100)                         |
| `nroAsociado`          | Si se setea, emite Nota de Crédito vinculada         |

**Condiciones de IVA soportadas:**

| String en frontend             | AFIP ID |
|--------------------------------|---------|
| `"Responsable Inscripto"`      | 1       |
| `"IVA Sujeto Exento"`          | 4       |
| `"Consumidor Final"` (default) | 5       |
| `"Responsable Monotributo"`    | 6       |
| `"Sujeto No Categorizado"`     | 7       |
| `"Proveedor del Exterior"`     | 8       |
| `"Cliente del Exterior"`       | 9       |
| `"IVA Liberado"`              | 10      |
| `"Monotributista Social"`      | 13      |
| `"IVA No Alcanzado"`          | 15      |
| `"Monotributo Trabajador..."` | 16      |

**Response:**

```json
{
  "CAE": "12345678901234",
  "CAEFchVto": "20260415",
  "ptoVenta": 1,
  "nroCbte": 43,
  "qrData": "https://www.afip.gob.ar/fe/qr/?p=..."
}
```

---

## Cómo se calculan los importes

```
totalBruto = sum(producto.price * producto.amount)
importeTotal = totalBruto - (totalBruto * discount / 100)

Para Factura A y B:
  impNeto = importeTotal / 1.21
  impIVA  = importeTotal - impNeto

Para Factura C:
  impNeto = importeTotal
  impIVA  = 0
```

Si `nroAsociado > 0` se emite **Nota de Crédito** del tipo correspondiente.

---

## Errores

Todas las funciones retornan error con formato:

```json
{
  "error": "Mensaje de error",
  "details": {
    "code": "VALIDATION_ERROR | AFIP_API_ERROR | INTERNAL_ERROR",
    "message": "Descripción"
  }
}
```

HTTP status: `400` (validación o error de AFIP), `401` (key inválida), `500` (error interno).
