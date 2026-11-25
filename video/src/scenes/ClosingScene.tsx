import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";

export const ClosingScene = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#101c29", color: "#f7f8f8", fontFamily: "Arial, Helvetica, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: 960, height: 960, borderRadius: "50%", border: "1px solid rgba(255,255,255,.08)", left: -440, top: -490 }} />
      <div style={{ position: "absolute", width: 780, height: 780, borderRadius: "50%", border: "1px solid rgba(255,255,255,.07)", right: -310, bottom: -470 }} />
       <div style={{ position: "absolute", top: 125, fontSize: 19, letterSpacing: 5, color: "#9babb5" }}>TU COMERCIO, MÁS ORGANIZADO</div>
       <div style={{ position: "absolute", top: 205, width: 176, height: 176, borderRadius: 28, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 25px 80px rgba(0,0,0,.3)", opacity: interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), scale: interpolate(frame, [0, 24], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Img src={staticFile("LOGO.png")} style={{ width: 166, height: 166, objectFit: "contain" }} />
      </div>
       <div style={{ position: "absolute", top: 430, fontSize: 78, fontWeight: 700, letterSpacing: -3, opacity: interpolate(frame, [12, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>Stock.ia</div>
       <div style={{ position: "absolute", top: 535, fontSize: 29, color: "#c1ccd2", opacity: interpolate(frame, [24, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>Punto de venta e inventario para tu negocio.</div>
       <div style={{ position: "absolute", top: 625, display: "flex", gap: 14, opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
         {["VENTAS", "CATÁLOGO", "INVENTARIO", "CUENTA CORRIENTE", "OPERACIÓN"].map((label) => <div key={label} style={{ padding: "12px 17px", border: "1px solid rgba(255,255,255,.18)", borderRadius: 30, fontSize: 13, letterSpacing: 1.5, color: "#a9bac2" }}>{label}</div>)}
       </div>
       <div style={{ position: "absolute", bottom: 82, left: "50%", translate: "-50% 0px", width: 170, height: 4, borderRadius: 3, background: "#35c7a8", opacity: interpolate(frame, [58, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }} />
       <div style={{ position: "absolute", right: 120, bottom: 73, fontSize: 16, letterSpacing: 2, color: "#aebdca" }}>07 / 07</div>
    </div>
  );
};
