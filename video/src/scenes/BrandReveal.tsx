import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";

export const BrandReveal = () => {
  const frame = useCurrentFrame();

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative", overflow: "hidden",
      background: "linear-gradient(120deg, #101b28 0%, #152536 56%, #203446 100%)",
      color: "#f5f7f8", fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      <div style={{ position: "absolute", width: 680, height: 680, borderRadius: "50%", background: "#31d0b0", opacity: 0.08, right: -90, top: -300 }} />
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", border: "1px solid rgba(255,255,255,.1)", right: 90, bottom: -280 }} />
      <div style={{ position: "absolute", left: 166, top: 145, fontSize: 22, fontWeight: 700, letterSpacing: 5, color: "#9aabba" }}>SOFTWARE PARA TU COMERCIO</div>
      <div style={{ position: "absolute", left: 166, top: 328, width: 840, opacity: interpolate(frame, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), translate: `0px ${interpolate(frame, [0, 22], [28, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px` }}>
        <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 700, letterSpacing: -2 }}>Tu negocio, bajo control.</div>
        <div style={{ marginTop: 30, fontSize: 32, color: "#aebdca" }}>Ventas e inventario, en una mirada.</div>
      </div>
      <div style={{ position: "absolute", right: 202, top: 238, width: 354, height: 354, background: "#fff", borderRadius: 46, display: "flex", justifyContent: "center", alignItems: "center", boxShadow: "0 35px 100px rgba(0,0,0,.32)", opacity: interpolate(frame, [8, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), scale: interpolate(frame, [8, 32], [0.88, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Img src={staticFile("LOGO.png")} style={{ width: 310, height: 310, objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", left: 166, bottom: 98, height: 4, width: 130, borderRadius: 2, background: "#31d0b0" }} />
       <div style={{ position: "absolute", right: 166, bottom: 98, fontSize: 19, letterSpacing: 3, color: "#aebdca" }}>01 / 07</div>
    </div>
  );
};
