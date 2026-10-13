import { ImageResponse } from "next/og";

export const alt = "QR Studio — free QR code generator";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #eef2ff 0%, #ffffff 60%)",
          color: "#0f172a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#4f46e5", display: "flex" }} />
          QR Studio
        </div>
        <div style={{ marginTop: 40, fontSize: 72, fontWeight: 800, lineHeight: 1.1, maxWidth: 900 }}>
          Free QR codes for links, videos, Wi-Fi & more
        </div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#475569" }}>No sign-up · PNG & SVG · Custom colors and logos</div>
      </div>
    ),
    size,
  );
}
