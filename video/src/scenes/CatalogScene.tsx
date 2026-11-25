import { interpolate, useCurrentFrame } from "remotion";

const catalogProducts = [
  { name: "Café molido", category: "Almacén", brand: "Tostadero Norte", price: "$ 4.800", code: "CF-024", shade: "#e6efe9", art: "☕" },
  { name: "Taza cerámica", category: "Hogar", brand: "Línea Nube", price: "$ 6.200", code: "TZ-108", shade: "#f2eade", art: "◒" },
  { name: "Yerba suave", category: "Almacén", brand: "Monte Claro", price: "$ 3.500", code: "YS-010", shade: "#e7edf2", art: "✳" },
  { name: "Miel de flores", category: "Natural", brand: "Colmena Sur", price: "$ 5.100", code: "MI-250", shade: "#f4eddf", art: "◉" },
];

const card = { background: "#fff", border: "1px solid #e5ebea", borderRadius: 16, boxShadow: "0 12px 34px rgba(18,42,54,.06)" };

export const CatalogScene = () => {
  const frame = useCurrentFrame();
  const entrance = interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#f4f7f6", color: "#172c3a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header style={{ height: 108, padding: "0 112px", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderBottom: "1px solid #e6ecea" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}><div style={{ width: 48, height: 48, borderRadius: 15, background: "#142b3a", color: "#fff", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800 }}>B</div><div><div style={{ fontSize: 22, fontWeight: 700 }}>Almacén Bruma</div><div style={{ color: "#839096", fontSize: 14, marginTop: 4 }}>Catálogo público</div></div></div>
      </header>

      <main style={{ padding: "28px 112px 58px", opacity: entrance, translate: `0px ${interpolate(frame, [0, 22], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 18 }}><div><div style={{ color: "#168e7a", fontSize: 15, fontWeight: 700, letterSpacing: 2 }}>CATÁLOGO DIGITAL PÚBLICO</div><h1 style={{ margin: "7px 0 0", fontSize: 36, letterSpacing: -1 }}>Productos disponibles</h1></div><div style={{ color: "#849198", fontSize: 14 }}>Contenido ficticio · vista ilustrativa</div></div>

        <section style={{ ...card, padding: 14, display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: "15px 18px", background: "#f7f9f8", border: "1px solid #e4eae8", borderRadius: 12, color: "#7d8a90", fontSize: 16 }}>⌕ &nbsp; Buscar por nombre, código, marca o categoría...</div>
          <div style={{ width: 290, padding: "15px 17px", background: "#f7f9f8", border: "1px solid #e4eae8", borderRadius: 12, display: "flex", justifyContent: "space-between", color: "#53676f", fontSize: 15 }}><span>▦ &nbsp; Todas las categorías</span><span>⌄</span></div>
        </section>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11, color: "#75858b", fontSize: 14 }}><b style={{ color: "#344c57", fontSize: 15 }}>Tarjetas de productos</b><span>4 artículos de ejemplo</span></div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr)) 405px", gap: 16, alignItems: "start" }}>
          {catalogProducts.map((product, index) => <article key={product.code} style={{ ...card, overflow: "hidden", opacity: interpolate(frame, [8 + index * 6, 25 + index * 6], [0.35, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: `0px ${interpolate(frame, [8 + index * 6, 25 + index * 6], [14, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
            <div style={{ height: 142, background: product.shade, display: "grid", placeItems: "center", position: "relative" }}><div style={{ width: 82, height: 82, borderRadius: 25, background: "rgba(255,255,255,.72)", display: "grid", placeItems: "center", fontSize: 40, color: "#476c67" }}>{product.art}</div><span style={{ position: "absolute", top: 12, left: 12, borderRadius: 18, background: "rgba(255,255,255,.9)", color: "#5c7478", padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>{product.category}</span></div>
            <div style={{ padding: "14px 15px 16px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#7d8b90", fontSize: 11, fontWeight: 700, letterSpacing: .5 }}><span>{product.brand.toUpperCase()}</span><span>#{product.code}</span></div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 7, minHeight: 23 }}>{product.name}</div><div style={{ color: "#168b78", fontSize: 23, fontWeight: 800, marginTop: 8 }}>{product.price} <span style={{ color: "#879398", fontSize: 12, fontWeight: 500 }}>un.</span></div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, padding: 6, border: "1px solid #e5ebe9", borderRadius: 10 }}><span style={{ color: "#889499", fontSize: 15 }}>−</span><b style={{ fontSize: 14 }}>0</b><span style={{ color: "#168b78", fontSize: 15 }}>＋</span></div><div style={{ marginTop: 9, padding: "11px 7px", textAlign: "center", color: "#fff", background: "#142b3a", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>＋ Agregar al pedido</div></div>
          </article>)}

          <aside style={{ ...card, minHeight: 505, padding: 20, boxSizing: "border-box", position: "relative", borderRadius: 19, boxShadow: "0 20px 54px rgba(18,42,54,.13)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1px solid #e9eeec" }}><div><div style={{ fontSize: 22, fontWeight: 700 }}>Mi Carrito</div><div style={{ color: "#839096", fontSize: 13, marginTop: 4 }}>Detalle del pedido</div></div><div style={{ width: 38, height: 38, borderRadius: 50, background: "#e7f5f1", color: "#188b77", display: "grid", placeItems: "center", fontWeight: 700 }}>2</div></div>
            {[["Café molido", "$ 4.800"], ["Yerba suave", "$ 3.500"]].map((item) => <div key={item[0]} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "17px 0", borderBottom: "1px solid #edf0ef" }}><div><b style={{ fontSize: 15 }}>{item[0]}</b><div style={{ color: "#849197", fontSize: 13, marginTop: 5 }}>Precio de ejemplo</div></div><div style={{ textAlign: "right" }}><b style={{ fontSize: 14 }}>{item[1]}</b><div style={{ display: "flex", justifyContent: "end", gap: 9, marginTop: 7, color: "#687a80", fontSize: 13 }}><span>−</span><b>1</b><span>＋</span></div></div></div>)}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 19, color: "#65777e", fontSize: 14 }}><span>Total estimado</span><b style={{ color: "#172c3a", fontSize: 23 }}>$ 8.300</b></div>
            <div style={{ display: "flex", gap: 9, marginTop: 17 }}><div style={{ flex: 1, padding: "12px 8px", borderRadius: 10, border: "1px solid #e4e9e8", color: "#8a5553", textAlign: "center", fontWeight: 600, fontSize: 13 }}>Vaciar</div><div style={{ flex: 1.5, padding: "12px 8px", borderRadius: 10, background: "#168b78", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 13 }}>Continuar al Pago</div></div>
            <div style={{ marginTop: 15, color: "#879398", textAlign: "center", fontSize: 12 }}>Carrito de ejemplo · importes ficticios</div>
          </aside>
        </div>
      </main>

      <div style={{ position: "absolute", right: 132, bottom: 47, width: 62, height: 62, borderRadius: 50, background: "#142b3a", color: "#fff", boxShadow: "0 12px 28px rgba(13,37,49,.24)", display: "grid", placeItems: "center", fontSize: 25 }}>▣<span style={{ position: "absolute", top: -4, right: -4, width: 23, height: 23, borderRadius: 50, background: "#e45757", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>2</span></div>
      <div style={{ position: "absolute", left: 112, bottom: 38, color: "#849197", fontSize: 14 }}>Carrito abierto desde el botón flotante</div>
      <div style={{ position: "absolute", left: 112, top: 81, color: "#849197", fontSize: 12, letterSpacing: 1.8 }}>STOCK.IA · 03 / 07</div>
    </div>
  );
};
