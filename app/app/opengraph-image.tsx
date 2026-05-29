import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Percolator — Permissionless Perpetuals on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Load a Google font as a TTF for Satori. Wrapped by the caller in try/catch so
// a network hiccup degrades to the embedded default font rather than 500ing the
// route (crawlers must always get a valid image).
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`;
  const css = await (
    await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })
  ).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  if (!src) throw new Error("font src not found");
  const res = await fetch(src[1]!);
  if (!res.ok) throw new Error("font fetch failed");
  return res.arrayBuffer();
}

export default async function OpengraphImage() {
  const logoBuffer = await readFile(
    join(process.cwd(), "public/images/logo-icon.png"),
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  let fonts:
    | { name: string; data: ArrayBuffer; weight: 500 | 700; style: "normal" }[]
    | undefined;
  try {
    const [w700, w500] = await Promise.all([
      loadGoogleFont("Outfit", 700),
      loadGoogleFont("Outfit", 500),
    ]);
    fonts = [
      { name: "Outfit", data: w700, weight: 700, style: "normal" },
      { name: "Outfit", data: w500, weight: 500, style: "normal" },
    ];
  } catch {
    fonts = undefined;
  }

  const fontFamily = fonts ? "Outfit, sans-serif" : "sans-serif";
  // Site signature gradient (waitlist hero): purple → Solana green.
  const brandGradient =
    "linear-gradient(110deg, #B97AFF 0%, #9945FF 38%, #14F195 100%)";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          backgroundColor: "#0A0A0F",
          // Dual aurora — one purple light top-left, one green wash bottom-right.
          backgroundImage:
            "radial-gradient(ellipse 1000px 760px at 12% 6%, rgba(153,69,255,0.42) 0%, rgba(10,10,15,0) 56%), radial-gradient(ellipse 920px 720px at 100% 104%, rgba(20,241,149,0.22) 0%, rgba(10,10,15,0) 55%)",
          fontFamily,
        }}
      >
        {/* Faint grid, fading downward — mirrors the site backdrop */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(to right, rgba(225,226,232,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(225,226,232,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(to bottom, black 25%, transparent 95%)",
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: "flex",
            borderRadius: 52,
            boxShadow: "0 0 110px rgba(153,69,255,0.50)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={236}
            height={236}
            alt="Percolator"
            style={{ borderRadius: 52 }}
          />
        </div>

        {/* Wordmark */}
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 120,
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1,
            color: "#E1E2E8",
          }}
        >
          Percolator
        </div>

        {/* Tagline — matches the waitlist hero phrasing + gradient accent */}
        <div
          style={{
            display: "flex",
            marginTop: 26,
            fontSize: 42,
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ color: "#8A8BA8", marginRight: 14 }}>
            Perp futures for
          </span>
          <span
            style={{
              backgroundImage: brandGradient,
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            every Solana token
          </span>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
