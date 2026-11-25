import { interpolate, useCurrentFrame } from "remotion";

const tiles = [
  { label: "CLIENTES", title: "Clientes", icon: "◎", tint: "#e4f2ed", accent: "#188b76" },
  { label: "CAJA", title: "Caja Registradora", icon: "$", tint: "#e9eef6", accent: "#536e96" },
  { label: "REPORTES", title: "Reporte Diario", icon: "▥", tint: "#f5eddf", accent: "#a8752f" },
];

const operationCard = { background: "#fff", border: "1px solid #e3e9e7", borderRadius: 17, boxShadow: "0 14px 40px rgba(18,42,54,.06)" };

export const OperationsScene = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f3f6f5", color: "#172c3a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ position: "absolute", top: 0, left: 0, right: 0, height: 82, padding: "0 112px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #e5ebea" }}><div style={{ display: "flex", alignItems: "center", gap: 13 }}><div style={{ width: 40, height: 40, borderRadius: 12, background: "#142b3a", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800 }}>S</div><b style={{ fontSize: 20 }}>Stock.ia</b><span style={{ color: "#a0aaad", marginLeft: 18 }}>Gestión del comercio</span></div><div style={{ color: "#718188", fontSize: 15 }}>Clientes · Caja Registradora · Reportes</div></header>
      <div style={{ position: "absolute", left: 112, top: 117 }}><div style={{ color: "#168e7a", fontSize: 15, fontWeight: 700, letterSpacing: 2.1 }}>OPERACIÓN DIARIA</div><div style={{ fontSize: 39, letterSpacing: -1.2, fontWeight: 700, marginTop: 7 }}>Clientes, caja y reportes.</div><div style={{ color: "#78878d", fontSize: 16, marginTop: 6 }}>Tres vistas para consultar la actividad del comercio.</div></div>

      <div style={{ position: "absolute", left: 112, right: 112, top: 267, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
        {tiles.map((tile, index) => <article key={tile.label} style={{ ...operationCard, height: 550, padding: 20, boxSizing: "border-box", opacity: interpolate(frame, [8 + index * 12, 32 + index * 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: `0px ${interpolate(frame, [8 + index * 12, 32 + index * 12], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 15, borderBottom: "1px solid #e9eeec" }}><div><div style={{ color: "#849197", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{tile.label}</div><div style={{ fontSize: index === 1 ? 19 : 21, fontWeight: 700, marginTop: 6 }}>{tile.title}</div></div><div style={{ width: 44, height: 44, borderRadius: 14, background: tile.tint, color: tile.accent, display: "grid", placeItems: "center", fontSize: 23, fontWeight: 700 }}>{tile.icon}</div></div>

            {index === 0 && <div style={{ paddingTop: 16 }}>
              <div style={{ padding: "10px 12px", background: "#f8faf9", border: "1px solid #e7ecea", borderRadius: 9, color: "#89959a", fontSize: 12 }}>⌕ &nbsp; Nombre, teléfono, email o CUIT...</div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#7d8a90", fontSize: 10, fontWeight: 700, letterSpacing: .8, margin: "17px 0 4px" }}><span>CLIENTE</span><span>SALDO</span></div>
              {[["LM", "Lucía Moreno", "$ 15.000"], ["TR", "Tomás Rivas", "$ 0"], ["EP", "Elena Paz", "$ 9.200"]].map((client, row) => <div key={client[1]} style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 0", borderBottom: "1px solid #eef1f0" }}><div style={{ width: 36, height: 36, borderRadius: 50, background: ["#e5f0ec", "#e9edf5", "#f3ece2"][row], color: "#58746e", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>{client[0]}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{client[1]}</div><div style={{ color: "#879398", fontSize: 11, marginTop: 3 }}>Cliente ficticio</div></div><b style={{ fontSize: 12 }}>{client[2]}</b></div>)}
              <div style={{ marginTop: 17, padding: "11px 12px", background: "#f1f7f4", color: "#5d786f", borderRadius: 9, fontSize: 12 }}>Búsqueda y saldos de ejemplo</div>
            </div>}

            {index === 1 && <div style={{ paddingTop: 13 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Historial de Movimientos</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10, padding: 4, background: "#f3f6f5", border: "1px solid #e4e9e8", borderRadius: 9 }}><span style={{ flex: 1, textAlign: "center", padding: "8px 4px", color: "#167f70", background: "#fff", borderRadius: 7, boxShadow: "0 1px 4px rgba(20,40,50,.08)", fontSize: 11, fontWeight: 700 }}>Solo efectivo</span><span style={{ flex: 1, textAlign: "center", padding: "8px 4px", color: "#718188", fontSize: 10 }}>Todos los medios de pago</span></div>
              <div style={{ display: "flex", gap: 9, marginTop: 12 }}><div style={{ flex: 1, padding: "8px 9px", border: "1px solid #e1e7e5", borderRadius: 8 }}><div style={{ color: "#849197", fontSize: 10 }}>Desde</div><b style={{ display: "block", marginTop: 4, fontSize: 12 }}>21/11/2026</b></div><div style={{ flex: 1, padding: "8px 9px", border: "1px solid #e1e7e5", borderRadius: 8 }}><div style={{ color: "#849197", fontSize: 10 }}>Hasta</div><b style={{ display: "block", marginTop: 4, fontSize: 12 }}>21/11/2026</b></div></div>
              <div style={{ marginTop: 12, padding: "11px 12px", borderRadius: 9, background: "#f4f7f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ color: "#77868c", fontSize: 10 }}>Total de movimientos filtrados (neto)</span><b style={{ fontSize: 18 }}>$ 26.800</b></div>
              <div style={{ display: "grid", gridTemplateColumns: ".9fr 1fr .8fr", gap: 4, marginTop: 16, paddingBottom: 8, borderBottom: "1px solid #e8edec", color: "#7c898e", fontSize: 10, fontWeight: 700 }}><span>FECHA / HORA</span><span>USUARIO</span><span style={{ textAlign: "right" }}>MONTO</span></div>
              {[["14:32", "Martina P.", "+ $19.300", "#17816f"], ["13:10", "Martina P.", "− $4.500", "#9a6723"], ["12:18", "Martina P.", "+ $12.000", "#17816f"]].map((movement) => <div key={movement[0]} style={{ display: "grid", gridTemplateColumns: ".9fr 1fr .8fr", gap: 4, alignItems: "center", padding: "13px 0", borderBottom: "1px solid #eef1f0", fontSize: 11 }}><span style={{ color: "#718188" }}>21 nov · {movement[0]}</span><span>{movement[1]}</span><b style={{ textAlign: "right", color: movement[3], fontSize: 11 }}>{movement[2]}</b></div>)}
              <div style={{ marginTop: 15, color: "#879398", fontSize: 11 }}>Movimientos ficticios · Caja Registradora</div>
            </div>}

            {index === 2 && <div style={{ paddingTop: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 11, borderBottom: "1px solid #edf0ef" }}><div style={{ color: "#728188", fontSize: 12 }}>Sábado, 21 de noviembre de 2026</div><div style={{ color: "#607179", fontSize: 11 }}>‹ &nbsp; ›</div></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                {[["Ventas Totales", "$ 126.400", "#eaf5ef"], ["Descuentos", "$ 4.200", "#fbf3e4"], ["Devoluciones", "$ 2.000", "#f9ecea"], ["Neto en Caja", "$ 124.400", "#eef2f6"]].map((metric) => <div key={metric[0]} style={{ background: metric[2], borderRadius: 10, padding: "10px 11px" }}><div style={{ color: "#687a80", fontSize: 11 }}>{metric[0]}</div><b style={{ display: "block", marginTop: 5, fontSize: 17 }}>{metric[1]}</b></div>)}
              </div>
              <div style={{ marginTop: 13, paddingTop: 11, borderTop: "1px solid #e8edec" }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>Canales de Pago</div>{[["Efectivo", "$ 84.500"], ["Transferencia", "$ 29.900"], ["Débito", "$ 12.000"]].map((method) => <div key={method[0]} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", color: "#64767d", fontSize: 11 }}><span>{method[0]}</span><b style={{ color: "#263c47" }}>{method[1]}</b></div>)}</div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e8edec" }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Actividad de Stock</div><div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ color: "#a0524e", fontSize: 11 }}>↓ Egresos <b style={{ color: "#263c47", marginLeft: 4 }}>18 un.</b></div><div style={{ color: "#17816f", fontSize: 11 }}>↑ Ingresos <b style={{ color: "#263c47", marginLeft: 4 }}>8 un.</b></div></div></div>
              <div style={{ marginTop: 11, color: "#879398", fontSize: 10 }}>También: Reporte Mensual · Reporte Anual</div>
            </div>}
          </article>)}
      </div>
      <div style={{ position: "absolute", right: 112, bottom: 25, color: "#839096", fontSize: 15, letterSpacing: 2 }}>STOCK.IA · 06 / 07</div>
    </div>
  );
};
