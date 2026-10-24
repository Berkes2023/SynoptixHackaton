import { ImageResponse } from "next/og";

export const alt = "DeepTrace — Your recruitment AI makes decisions. Who audits them?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0c0c0d", color: "#f0efec" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#1c5cab" }} />
          DeepTrace
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Your recruitment AI makes decisions. Who audits them?</div>
          <div style={{ fontSize: 28, color: "#b9b8b0" }}>Independent AI recruitment fairness auditing</div>
        </div>
        <div style={{ fontSize: 22, color: "#8c8a84" }}>Trace the decision. Detect the bias. Strengthen accountability.</div>
      </div>
    ),
    size,
  );
}
