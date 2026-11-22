import { interpolate, useCurrentFrame } from "remotion";

const stockRows = [
  { code: "CF-024", product: "Café molido", variant: "250 g · Tostadero Norte", brand: "Tostadero Norte", quantity: "42", price: "$ 4.800,00", tint: "#e6efe9", mark: "CF" },
  { code: "TZ-108", product: "Taza cerámica", variant: "Línea Nube", brand: "Línea Nube", quantity: "8", price: "$ 6.200,00", tint: "#f2eade", mark: "TZ" },
  { code: "YS-010", product: "Yerba suave", variant: "Paquete 1 kg", brand: "Monte Claro", quantity: "31", price: "$ 3.500,00", tint: "#e7edf2", mark: "YS" },
  { code: "MI-250", product: "Miel de flores", variant: "Frasco 250 g", brand: "Colmena Sur", quantity: "5", price: "$ 5.100,00", tint: "#f4eddf", mark: "MI" },
];

const bordered = { background: "#ffffff", border: "1px solid #e2e9e7", borderRadius: 16, boxShadow: "0 12px 36px rgba(18,42,54,.05)" };

export const InventoryScene = () => {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f3f6f5", color: "#172c3a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ height: 82, padding: "0 112px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderBottom: "1px solid #e5ebea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}><div style={{ width: 40, height: 40, borderRadius: 12, background: "#142b3a", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 19 }}>S</div><b style={{ fontSize: 20 }}>Stock.ia</b><span style={{ color: "#a0aaad", margin: "0 12px" }}>/</span><span style={{ color: "#607179", fontSize: 16 }}>Productos</span></div>
        <div style={{ display: "flex", gap: 27, color: "#74848a", fontSize: 15 }}><span>Ventas</span><span style={{ color: "#178b78", fontWeight: 700 }}>Inventario</span><span>Clientes</span><span>Caja</span></div>
      </header>
      <main style={{ padding: "33px 112px 70px", opacity: entrance, translate: `0px ${interpolate(frame, [0, 20], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 20 }}><div><div style={{ color: "#168e7a", fontSize: 16, fontWeight: 700, letterSpacing: 2.2 }}>PRODUCTOS Y EXISTENCIAS</div><h1 style={{ margin: "8px 0 0", fontSize: 40, letterSpacing: -1.3 }}>Inventario</h1><div style={{ color: "#7b898f", marginTop: 5, fontSize: 16 }}>Consulta de productos y niveles de stock.</div></div><div style={{ fontSize: 14, color: "#839096" }}>Registros ficticios</div></div>

        <section style={{ ...bordered, padding: "17px 18px", marginBottom: 17, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 440 }}><div style={{ border: "1px solid #e0e7e5", background: "#f8faf9", borderRadius: 10, padding: "12px 15px", color: "#87949a", fontSize: 15 }}>⌕ &nbsp; Buscar productos por nombre o código...</div><div style={{ display: "flex", gap: 20, marginTop: 10, color: "#687980", fontSize: 13 }}><span>☐ &nbsp;Solo código</span><span>☐ &nbsp;Código exacto</span></div></div>
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "#142b3a", color: "white", fontWeight: 700, fontSize: 14 }}>＋ Nuevo</div><div style={{ padding: "12px 15px", border: "1px solid #e0e7e5", borderRadius: 10, color: "#55736a", fontSize: 14, fontWeight: 600 }}>▤ Carga</div><div style={{ padding: "12px 15px", border: "1px solid #e0e7e5", borderRadius: 10, color: "#61747b", fontSize: 14, fontWeight: 600 }}>▥ Escanear</div><div style={{ padding: "12px 15px", border: "1px solid #e0e7e5", borderRadius: 10, color: "#61747b", fontSize: 14, fontWeight: 600 }}>☑ Selección múltiple</div>
        </section>

        <section style={{ ...bordered, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 23px", borderBottom: "1px solid #e8edec" }}><div><div style={{ fontSize: 20, fontWeight: 700 }}>Productos</div><div style={{ color: "#859196", fontSize: 14, marginTop: 5 }}>128 resultados · datos ficticios</div></div><div style={{ color: "#7c898e", fontSize: 14 }}>Listado de productos</div></div>
          <div style={{ display: "grid", gridTemplateColumns: ".5fr .85fr 2fr 1.2fr .7fr .95fr .8fr", padding: "0 25px", height: 48, alignItems: "center", background: "#f8faf9", color: "#78878d", fontSize: 12, fontWeight: 700, letterSpacing: 1.1 }}><span>FOTO</span><span>CÓDIGO</span><span>DESCRIPCIÓN</span><span>MARCA</span><span style={{ textAlign: "center" }}>CANTIDAD</span><span style={{ textAlign: "right" }}>PRECIO</span><span style={{ textAlign: "right" }}>ACCIONES</span></div>
          {stockRows.map((item, index) => <div key={item.code} style={{ display: "grid", gridTemplateColumns: ".5fr .85fr 2fr 1.2fr .7fr .95fr .8fr", padding: "0 25px", height: 84, alignItems: "center", borderTop: "1px solid #edf0ef", fontSize: 15, opacity: interpolate(frame, [12 + index * 7, 28 + index * 7], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <div style={{ height: 42, width: 42, borderRadius: 11, background: item.tint, color: "#57716f", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>{item.mark}</div><span style={{ color: "#65777e", fontSize: 13, fontFamily: "monospace" }}>{item.code}</span>
            <div><div style={{ fontWeight: 700 }}>{item.product}</div><div style={{ color: "#89959a", fontSize: 13, marginTop: 4 }}>{item.variant}</div></div><span style={{ color: "#65767d" }}>{item.brand}</span><div style={{ textAlign: "center", fontWeight: 700, color: "#203642" }}>{item.quantity} <span style={{ fontWeight: 400, color: "#89959a", fontSize: 13 }}>un.</span></div><span style={{ textAlign: "right", fontWeight: 600 }}>{item.price}</span><div style={{ display: "flex", justifyContent: "end", gap: 7, color: "#687d84", fontSize: 16 }}><span style={{ border: "1px solid #e4e9e8", borderRadius: 8, padding: "6px 9px" }}>✎</span><span style={{ border: "1px solid #e4e9e8", borderRadius: 8, padding: "6px 9px" }}>▤</span><span style={{ border: "1px solid #e4e9e8", borderRadius: 8, padding: "6px 9px" }}>⋯</span></div>
          </div>)}
          <div style={{ padding: "14px 25px", borderTop: "1px solid #e9eeed", display: "flex", justifyContent: "space-between", color: "#77868c", fontSize: 14 }}><span>1–4 de 128 productos</span><span>Anterior &nbsp; <b style={{ color: "#17303d" }}>1 / 32</b> &nbsp; Siguiente ›</span></div>
        </section>
      </main>
      <div style={{ position: "absolute", right: 112, bottom: 25, color: "#839096", fontSize: 15, letterSpacing: 2 }}>STOCK.IA · 04 / 07</div>
    </div>
  );
};
