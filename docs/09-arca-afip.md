# 9. ARCA / AFIP — Factura Electrónica

## Descripción General

Integración con **ARCA** (ex AFIP) para la generación de comprobantes electrónicos (Factura A, B, C, etc.) y obtención de CAE. La integración se realiza mediante **Google Cloud Functions** que encapsulan la comunicación con los servicios de ARCA.

> **Nota:** ARCA es el organismo recaudador argentino. AFIP fue renombrado a ARCA. El código usa ambos nombres por razones históricas.

## Arquitectura

```mermaid
flowchart TD
    subgraph "Sistema POS"
        SA[Server Actions] --> Cred[getArcaCredentialsForBilling]
        SA --> Voucher[getVoucherNumberAction]
        SA --> CF[createAfipVoucherAction]
    end
    
    subgraph "Google Cloud Functions"
        CFn1[createAFIPVoucher]
        CFn2[getLastVoucherHandler]
    end
    
    subgraph "ARCA"
        WS[ARCA WebService]
        Auth[Autenticación]
        FE[Factura Electrónica]
    end
    
    SA --> CFn1
    SA --> CFn2
    CFn1 --> WS
    CFn2 --> Auth
    WS --> FE
    
    CFn1 --> SA
    CFn2 --> SA
```

## Configuración del Negocio

### Datos ARCA

```prisma
model Business {
  // ... otros campos ...
  
  cuit              String?         // CUIT del negocio
  razonSocial       String?         // Razón social
  inicioActividades DateTime?       // Fecha de inicio
  condicionIva      IvaCondition    // MONOTRIBUTO | RESPONSABLE_INSCRIPTO
  address           String?         // Domicilio fiscal
  cert              String? @db.Text // Certificado encriptado
  key               String? @db.Text // Clave privada encriptada
  ptoVenta          Int[] @default([]) // Puntos de venta habilitados
}
```

### Campos de Configuración (Zod)

```typescript
const ArcaFieldsSchema = z.object({
  cuit: z.string().length(11, "CUIT debe tener 11 dígitos"),
  razonSocial: z.string().min(1, "Razón social requerida"),
  inicioActividades: z.date(),
  condicionIva: z.enum(["RESPONSABLE_INSCRIPTO", "MONOTRIBUTO"]),
  cert: z.string().optional(),
  key: z.string().optional(),
  ptoVenta: z.array(z.number()),
});
```

### Encriptación

Certificados y claves se almacenan **encriptados** en la base de datos:

```typescript
import { encrypt } from "@/lib/encryption";

const updateData = { ...arcaFields };
if (cert) updateData.cert = encrypt(cert);
if (key) updateData.key = encrypt(key);

await db.business.update({ where: { id: businessId }, data: updateData });
```

## Server Actions

### `getBusinessArcaData(businessId)`

Obtiene datos ARCA de un negocio (solo ADMIN/SUPER_ADMIN de ese negocio).

### `updateBusinessArcaData(businessId, values)`

Actualiza datos ARCA, encriptando cert y key si se proporcionan.

### `getArcaCredentialsForBilling()`

Recupera credenciales desencriptadas para el proceso de facturación:

```typescript
export const getArcaCredentialsForBilling = async () => {
  const business = await db.business.findUnique({
    where: { id: businessId },
    select: { cuit: true, cert: true, key: true },
  });
  
  if (!business || !business.cuit || !business.cert || !business.key) {
    return { error: "Credenciales de ARCA incompletas" };
  }
  
  return { success: { cuit: business.cuit, cert: business.cert, key: business.key } };
};
```

### `createAfipVoucherAction(billState)`

Crea un comprobante electrónico llamando a la Cloud Function:

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant SA as createAfipVoucherAction
    participant CF as Cloud Function
    participant ARCA as ARCA WS
    
    UI->>SA: billState (con ptoVenta)
    SA->>SA: Verificar feature hasAfipBilling
    
    SA->>SA: Obtener credenciales (getArcaCredentialsForBilling)
    
    SA->>CF: POST con cert, key, cuit, billState
    Note over SA,CF: x-internal-key para autenticación
    
    CF->>ARCA: Llamada a WS de ARCA
    ARCA-->>CF: CAE + datos comprobante
    CF-->>SA: { success, data: { CAE, nroComprobante, ... } }
    
    SA-->>UI: { success, data: { CAE, qrData } }
```

### `getVoucherNumberAction(puntoVenta, tipoFactura)`

Obtiene el último número de comprobante usado:

```typescript
const payload = {
  action: "getLastVoucher",
  encryptedCert: business.cert,
  encryptedKey: business.key,
  arca: { cuit: business.cuit },
  puntoVenta,
  tipoFactura,  // 1=Factura A, 6=Factura B, 11=Factura C, etc.
};

const response = await fetch(`${cloudFunctionUrl}/getLastVoucherHandler`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-key": apiKey },
  body: JSON.stringify(payload),
});
```

## CAE (Código de Autorización Electrónico)

```typescript
interface CAE {
  CAE: string;              // Código de autorización
  nroComprobante: number;   // Número de comprobante
  vencimiento: string;      // Fecha de vencimiento del CAE
  qrData: string;           // Datos para código QR (RG 4958)
}
```

El CAE se almacena como JSON en la orden:

```prisma
model Order {
  CAE Json?  // { CAE, nroComprobante, vencimiento, qrData }
}
```

## Flujo de Factura Electrónica Completo

```mermaid
sequenceDiagram
    actor V as Vendedor
    participant UI as NewBill
    participant SA as processSaleAction
    participant AFIP as createAfipVoucherAction
    participant CF as Cloud Function
    participant ARCA as ARCA
    
    V->>UI: Configura factura (tipo, ptoVenta, datos cliente)
    V->>UI: Agrega productos
    V->>UI: Click "Facturar con ARCA"
    
    UI->>AFIP: createAfipVoucherAction(billState)
    AFIP->>AFIP: Obtener credenciales
    AFIP->>CF: POST /createAFIPVoucher
    
    CF->>ARCA: WS de ARCA
    ARCA-->>CF: { CAE, vencimiento, nroComprobante, qrData }
    CF-->>AFIP: response
    
    AFIP-->>UI: { success, data: { CAE, ... } }
    
    UI->>UI: Almacenar CAE en BillContext
    
    V->>UI: Click "Procesar Venta"
    UI->>SA: processSaleAction(billState + CAE)
    SA->>DB: Guardar Order con CAE
    DB-->>SA: OK
    
    SA-->>UI: { success, orderId }
    UI-->>V: Factura electrónica emitida
```

## Seguridad

- **x-internal-key**: Las Cloud Functions usan una API key compartida
- **Certificados encriptados**: Se almacenan en DB usando `encrypt()` y se envían directamente a CF sin desencriptar en el frontend
- **Feature gate**: `hasAfipBilling` solo disponible en plan Enterprise
- **Autenticación**: Solo ADMIN/SUPER_ADMIN pueden configurar datos ARCA

## Variables de Entorno

```env
# URL de las Cloud Functions
NEXT_PUBLIC_AFIP_FUNCTION_URL=http://localhost:5001/.../createAFIPVoucher
NEXT_PUBLIC_CLOUD_FUNCTION_URL=https://...cloudfunctions.net

# API Keys internas
INTERNAL_AFIP_API_KEY=xxx
AFIPSDK_API_KEY=xxx
```
