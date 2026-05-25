import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Percolator — Permissionless Perpetuals on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logoBuffer = await readFile(
    join(process.cwd(), "public/images/logo-icon.png"),
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          position: "relative",
          padding: "0 96px",
          backgroundColor: "#06070a",
          backgroundImage:
            "radial-gradient(ellipse 900px 600px at 15% 25%, rgba(153,69,255,0.35) 0%, rgba(6,7,10,0) 60%)",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent 0%, #9945FF 50%, transparent 100%)",
            opacity: 0.7,
          }}
        />

        {/* Logo + wordmark row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            marginBottom: 44,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 96,
              height: 96,
              borderRadius: 24,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 0 60px rgba(153,69,255,0.45)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              width={72}
              height={72}
              alt="Percolator"
              style={{ borderRadius: 16 }}
            />
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#ffffff",
              display: "flex",
            }}
          >
            Percolator
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 104,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.045em",
            color: "#ffffff",
            display: "flex",
            maxWidth: 980,
          }}
        >
          Permissionless perps on Solana.
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: "#a1a1aa",
            maxWidth: 900,
            lineHeight: 1.35,
            marginTop: 28,
            display: "flex",
          }}
        >
          Launch and trade perpetual futures for any Solana token.
        </div>

        {/* Footer URL */}
        <div
          style={{
            position: "absolute",
            bottom: 56,
            left: 96,
            fontSize: 26,
            fontWeight: 500,
            color: "#9945FF",
            letterSpacing: "-0.005em",
            display: "flex",
          }}
        >
          percolatorlaunch.com
        </div>
      </div>
    ),
    { ...size },
  );
}
