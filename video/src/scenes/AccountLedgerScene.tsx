import { interpolate, useCurrentFrame } from "remotion";

const sampleOrders = [
  { client: "Lucía Moreno", date: "21 nov 2026", total: "$ 24.000", balance: "$ 15.000", status: "Pendiente Pago", color: "#fff0df", ink: "#9a6723" },
  { client: "Tomás Rivas", date: "20 nov 2026", total: "$ 18.500", balance: "$ 0", status: "Pagado", color: "#e6f5ef", ink: "#19806d" },
  { client: "Elena Paz", date: "19 nov 2026", total: "$ 9.200", balance: "$ 9.200", status: "Por Confirmar", color: "#fff0df", ink: "#9a6723" },
];

const card = { background: "#fff", border: "1px solid #e3e9e7", borderRadius: 16, boxShadow: "0 14px 40px rgba(18,42,54,.06)" };

export const AccountLedgerScene = () => {
  const frame = useCurrentFrame();
  const listOpacity = interpolate(frame, [78, 102], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const detailOpacity = interpolate(frame, [78, 102], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const detailShift = interpolate(frame, [78, 102], [26, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f3f6f5", color: "#172c3a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ height: 82, padding: "0 112px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #e5ebea" }}><div style={{ display: "flex", alignItems: "center", gap: 13 }}><div style={{ width: 40, height: 40, borderRadius: 12, background: "#142b3a", color: "white", display: "grid", placeItems: "center", fontWeight: 800 }}>S</div><b style={{ fontSize: 20 }}>Stock.ia</b><span style={{ color: "#a0aaad", margin: "0 12px" }}>/</span><span style={{ color: "#178b78", fontSize: 16, fontWeight: 700 }}>Cuenta Corriente</span></div></header>

      <section style={{ position: "absolute", inset: "116px 112px 75px", opacity: listOpacity, translate: `0px ${interpolate(frame, [0, 18], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 21 }}><div><h1 style={{ margin: 0, fontSize: 39, letterSpacing: -1.1 }}>Cuenta Corriente</h1><div style={{ color: "#859197", fontSize: 14, marginTop: 7 }}>Registros de muestra · todos ficticios</div></div></div>
        <div style={{ ...card, padding: 18, display: "flex", alignItems: "center", gap: 14, marginBottom: 17 }}><div style={{ flex: 1, padding: "13px 16px", border: "1px solid #e1e8e6", borderRadius: 10, background: "#f9fbfa", color: "#859298", fontSize: 15 }}>⌕ &nbsp; Buscar por nombre de cliente...</div></div>
        <div style={{ ...card, padding: "0 24px 20px" }}>
          <div style={{ display: "flex", gap: 28, borderBottom: "1px solid #e8edec", height: 60, alignItems: "center", color: "#6e7f85", fontSize: 15 }}><span style={{ height: "100%", display: "flex", alignItems: "center", borderBottom: "3px solid transparent" }}>Por Confirmar</span><span style={{ height: "100%", display: "flex", alignItems: "center", borderBottom: "3px solid #178b78", color: "#178b78", fontWeight: 700 }}>Pendientes de Pago</span><span style={{ height: "100%", display: "flex", alignItems: "center", borderBottom: "3px solid transparent" }}>Pagados</span><span style={{ height: "100%", display: "flex", alignItems: "center", borderBottom: "3px solid transparent" }}>Todos</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .9fr 1fr .95fr .5fr", alignItems: "center", height: 51, color: "#7c898e", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}> <span>CLIENTE</span><span>TOTAL</span><span>SALDO DE CUENTA</span><span>FECHA</span><span>ESTADO</span><span style={{ textAlign: "right" }}>ACCIONES</span></div>
          {sampleOrders.map((order, index) => <div key={order.client} style={{ display: "grid", gridTemplateColumns: "1.4fr .8fr .9fr 1fr .95fr .5fr", alignItems: "center", height: 90, borderTop: "1px solid #edf0ef", fontSize: 15, opacity: interpolate(frame, [14 + index * 10, 31 + index * 10], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 39, height: 39, borderRadius: 50, background: ["#e2efeb", "#e9edf5", "#f3ece1"][index], display: "grid", placeItems: "center", color: "#50736b", fontWeight: 700 }}>{order.client.split(" ").map((part) => part[0]).join("")}</div><b>{order.client}</b></div><b>{order.total}</b><span>{order.balance}</span><span style={{ color: "#77868c" }}>{order.date}</span><span style={{ justifySelf: "start", borderRadius: 20, padding: "8px 11px", color: order.ink, background: order.color, fontSize: 12, fontWeight: 700 }}>{order.status}</span><span style={{ textAlign: "right", color: "#168b78", fontWeight: 700 }}>Ver ›</span></div>)}
        </div>
      </section>

      <section style={{ position: "absolute", inset: "112px 112px 70px", opacity: detailOpacity, translate: `${detailShift}px 0px` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#73838a", fontSize: 15, marginBottom: 19 }}><span>‹ Volver a Cuenta Corriente</span><span>/</span><span style={{ color: "#172c3a", fontWeight: 700 }}>Detalle de cuenta</span><span style={{ marginLeft: "auto", color: "#89959a", fontSize: 14 }}>Registro ficticio · detalle de ejemplo</span></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 19 }}><div><div style={{ color: "#168e7a", fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>CUENTA CORRIENTE</div><h1 style={{ margin: "7px 0 0", fontSize: 38, letterSpacing: -1 }}>Lucía Moreno</h1><div style={{ color: "#819096", fontSize: 15, marginTop: 5 }}>Venta #V-2048 · 21 nov 2026</div></div><div style={{ borderRadius: 20, padding: "10px 15px", background: "#fff0df", color: "#9a6723", fontWeight: 700, fontSize: 14 }}>Pendiente Pago</div></div>

        <div style={{ display: "grid", gridTemplateColumns: "1.52fr .88fr", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
            <article style={{ ...card, padding: "20px 23px" }}><div style={{ fontSize: 20, fontWeight: 700, marginBottom: 15 }}>Productos</div><div style={{ display: "grid", gridTemplateColumns: "1fr .6fr .8fr .8fr", padding: "0 0 11px", color: "#829096", fontSize: 12, fontWeight: 700, letterSpacing: 1, borderBottom: "1px solid #e8edec" }}><span>ARTÍCULO</span><span>CANT.</span><span>PRECIO</span><span style={{ textAlign: "right" }}>IMPORTE</span></div>{[["Café molido · paquete 250 g", "2", "$ 6.000", "$ 12.000"], ["Taza cerámica · Línea Nube", "2", "$ 6.000", "$ 12.000"]].map((row) => <div key={row[0]} style={{ display: "grid", gridTemplateColumns: "1fr .6fr .8fr .8fr", alignItems: "center", height: 57, borderBottom: "1px solid #f0f2f1", fontSize: 14 }}><b>{row[0]}</b><span>{row[1]}</span><span>{row[2]}</span><b style={{ textAlign: "right" }}>{row[3]}</b></div>)}<div style={{ display: "flex", justifyContent: "end", gap: 60, paddingTop: 15, fontSize: 16 }}><span style={{ color: "#75848a" }}>Total de la cuenta</span><b>$ 24.000</b></div></article>
            <article style={{ ...card, padding: "19px 23px" }}><div style={{ fontSize: 20, fontWeight: 700 }}>Historial de pagos</div><div style={{ color: "#839096", fontSize: 14, marginTop: 4, marginBottom: 12 }}>Movimientos registrados en esta cuenta</div>{[["Abono recibido", "20 nov 2026 · Efectivo", "$ 5.000"], ["Abono recibido", "21 nov 2026 · Transferencia", "$ 4.000"]].map((payment) => <div key={payment[1]} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderTop: "1px solid #edf0ef", fontSize: 14 }}><div><b>{payment[0]}</b><div style={{ color: "#829096", fontSize: 13, marginTop: 4 }}>{payment[1]}</div></div><b style={{ color: "#16856f" }}>{payment[2]}</b></div>)}</article>
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: 17 }}>
            <article style={{ ...card, padding: 23 }}><div style={{ color: "#74848a", fontSize: 15 }}>Resumen de cuenta</div><div style={{ marginTop: 19, display: "flex", justifyContent: "space-between", fontSize: 15 }}><span>Total</span><b>$ 24.000</b></div><div style={{ marginTop: 15, display: "flex", justifyContent: "space-between", fontSize: 15 }}><span>Abonado</span><b style={{ color: "#16856f" }}>$ 9.000</b></div><div style={{ height: 1, background: "#e8edec", margin: "19px 0" }} /><div style={{ color: "#74848a", fontSize: 14 }}>Saldo pendiente</div><div style={{ fontSize: 36, fontWeight: 800, color: "#142b3a", marginTop: 6 }}>$ 15.000</div><div style={{ height: 8, background: "#edf1ef", borderRadius: 6, marginTop: 16, overflow: "hidden" }}><div style={{ width: "37.5%", height: "100%", background: "#35b79d" }} /></div><div style={{ color: "#829096", fontSize: 13, marginTop: 9 }}>Abonado: 37,5% del total</div></article>
            <article style={{ ...card, padding: 21 }}><div style={{ fontWeight: 700, fontSize: 17 }}>Estado de la cuenta</div><div style={{ color: "#77878d", fontSize: 14, marginTop: 9 }}>Saldo restante luego de 2 pagos.</div><div style={{ marginTop: 17, padding: "13px 14px", borderRadius: 10, background: "#f4f8f6", color: "#58736d", fontSize: 14 }}>Importes ilustrativos · todos los registros son ficticios.</div></article>
          </aside>
        </div>
      </section>
      <div style={{ position: "absolute", right: 112, bottom: 23, color: "#839096", fontSize: 15, letterSpacing: 2 }}>STOCK.IA · 05 / 07</div>
    </div>
  );
};
