import { interpolate, useCurrentFrame } from "remotion";

const products = [
  { name: "Café molido", detail: "250 g · Tostado", quantity: "2", price: "$ 4.800", total: "$ 9.600", color: "#e7f0ec", initials: "CF" },
  { name: "Taza cerámica", detail: "Línea Nube", quantity: "1", price: "$ 6.200", total: "$ 6.200", color: "#f4eee5", initials: "TZ" },
  { name: "Yerba suave", detail: "Paquete 1 kg", quantity: "1", price: "$ 3.500", total: "$ 3.500", color: "#e8edf4", initials: "YS" },
];

const panel = { background: "#ffffff", border: "1px solid #e3e9e8", borderRadius: 18, boxShadow: "0 16px 48px rgba(18,42,54,.07)" };
const muted = { color: "#72818a" };

export const CheckoutScene = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f3f6f5", color: "#172c3a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ height: 88, padding: "0 118px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", borderBottom: "1px solid #e5ebea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ width: 42, height: 42, borderRadius: 13, background: "#142b3a", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 21 }}>S</div><div style={{ fontWeight: 700, fontSize: 22 }}>Stock.ia <span style={{ color: "#91a0a5", fontWeight: 400 }}> / Punto de venta</span></div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 16, ...muted }}><span>Ventas</span><span>Productos</span><span style={{ padding: "10px 14px", borderRadius: 12, background: "#e8f6f2", color: "#138b78", fontWeight: 700 }}>Sesión de caja abierta</span><span style={{ width: 38, height: 38, borderRadius: 50, background: "#dcebe7", display: "grid", placeItems: "center", color: "#386f61", fontWeight: 700 }}>MP</span></div>
      </header>

      <main style={{ padding: "50px 120px 74px", opacity: reveal, translate: `0px ${interpolate(frame, [0, 20], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 25 }}>
          <div><div style={{ color: "#148d7b", fontSize: 17, letterSpacing: 2.5, fontWeight: 700 }}>VENTA EN MOSTRADOR</div><h1 style={{ margin: "10px 0 0", fontSize: 43, letterSpacing: -1.4 }}>Registrar una venta</h1><p style={{ margin: "8px 0 0", fontSize: 18, ...muted }}>Productos, comprobante y pago en una misma vista.</p></div>
          <div style={{ color: "#819096", fontSize: 16 }}>Ejemplo visual · datos ficticios</div>
        </div>

        <section style={{ ...panel, padding: "23px 27px", marginBottom: 20, display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "#edf3f6", color: "#526d7e", display: "grid", placeItems: "center", fontSize: 21 }}>▤</div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Parámetros de venta</div>
          <div style={{ height: 36, width: 1, background: "#e7eceb", margin: "0 6px" }} />
          {[["Comprobante", "Factura C"], ["Pto. Venta", "001"], ["Condición IVA", "Consumidor final"], ["Medio de pago", "Efectivo"]].map(([label, value]) => <div key={label} style={{ minWidth: 190, padding: "0 14px", borderLeft: "1px solid #eef1f0" }}><div style={{ ...muted, fontSize: 13, marginBottom: 6 }}>{label}</div><div style={{ fontWeight: 700, fontSize: 16 }}>{value} <span style={{ color: "#8a999e", fontWeight: 400 }}>⌄</span></div></div>)}
          <div style={{ marginLeft: "auto", borderRadius: 10, border: "1px solid #dce5e4", padding: "10px 16px", fontWeight: 600, fontSize: 15, color: "#52646c" }}>Editar</div>
        </section>

        <section style={{ ...panel, minHeight: 520, overflow: "hidden" }}>
          <div style={{ padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e9eeed" }}>
            <div><div style={{ fontWeight: 700, fontSize: 22 }}>Productos</div><div style={{ ...muted, marginTop: 5, fontSize: 15 }}>Buscá y agregá artículos a la venta</div></div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><div style={{ border: "1px solid #dfe7e5", borderRadius: 10, padding: "12px 17px", width: 300, color: "#859298", fontSize: 15 }}>⌕  Buscar producto o código</div><div style={{ padding: "12px 17px", borderRadius: 10, background: "#142b3a", color: "#fff", fontWeight: 700, fontSize: 15 }}>＋ Agregar</div></div>
          </div>
          <div style={{ padding: "0 28px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .6fr .8fr .8fr", height: 54, alignItems: "center", color: "#7f8d92", fontSize: 13, fontWeight: 700, letterSpacing: 1.2, borderBottom: "1px solid #e9eeed" }}><span>PRODUCTO</span><span>DETALLE</span><span>CANT.</span><span>PRECIO</span><span style={{ textAlign: "right" }}>IMPORTE</span></div>
            {products.map((product, index) => <div key={product.name} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr .6fr .8fr .8fr", height: 88, alignItems: "center", borderBottom: "1px solid #eef1f0", fontSize: 16, opacity: interpolate(frame, [10 + index * 9, 25 + index * 9], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}><div style={{ width: 48, height: 48, borderRadius: 13, background: product.color, display: "grid", placeItems: "center", color: "#4c6a70", fontWeight: 700, fontSize: 14 }}>{product.initials}</div><span style={{ fontWeight: 700 }}>{product.name}</span></div><span style={muted}>{product.detail}</span><span style={{ width: 50, padding: "8px 0", textAlign: "center", border: "1px solid #e1e8e6", borderRadius: 8 }}>{product.quantity}</span><span>{product.price}</span><span style={{ textAlign: "right", fontWeight: 700 }}>{product.total}</span>
            </div>)}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 0" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}><span style={{ width: 11, height: 11, background: "#27aa91", borderRadius: 50 }} /><div><div style={{ fontWeight: 700, fontSize: 16 }}>Caja abierta</div><div style={{ ...muted, marginTop: 4, fontSize: 14 }}>Turno mañana · inicio 08:30 · responsable: Martina P.</div></div><div style={{ marginLeft: 10, background: "#eff7f4", color: "#22816f", borderRadius: 9, padding: "9px 13px", fontWeight: 700, fontSize: 13 }}>SESIÓN ACTIVA</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 36 }}><div style={{ textAlign: "right", color: "#738188", fontSize: 15 }}>Subtotal <b style={{ color: "#192e3b", marginLeft: 22, fontSize: 19 }}>$ 19.300</b></div><div style={{ borderRadius: 12, background: "#142b3a", color: "#fff", padding: "16px 23px", fontSize: 18, fontWeight: 700 }}>Total&nbsp;&nbsp; $ 19.300</div></div>
            </div>
          </div>
        </section>
      </main>
      <div style={{ position: "absolute", right: 120, bottom: 28, color: "#839197", fontSize: 15, letterSpacing: 2 }}>STOCK.IA · 02 / 07</div>
    </div>
  );
};
