import type { CSSProperties } from "react";
import type { QrGeometry } from "@/lib/qr/geometry";

/** React rendering of the exact same geometry the SVG/PNG exporters use. */
export function QrSvg({
  geometry,
  foreground,
  background,
  logoDataUrl,
  label,
  className,
  style,
}: {
  geometry: QrGeometry;
  foreground: string;
  background: string;
  logoDataUrl: string | null;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const v = geometry.viewSize;
  return (
    <svg
      viewBox={`0 0 ${v} ${v}`}
      role="img"
      aria-label={label}
      shapeRendering={geometry.crispEdges ? "crispEdges" : "geometricPrecision"}
      className={className}
      style={style}
    >
      <rect width={v} height={v} fill={background} />
      <path d={geometry.path} fill={foreground} fillRule="evenodd" />
      {geometry.logo && logoDataUrl && (
        <>
          {geometry.logo.plate && (
            <rect
              x={geometry.logo.plate.x}
              y={geometry.logo.plate.y}
              width={geometry.logo.plate.width}
              height={geometry.logo.plate.height}
              rx={geometry.logo.plate.radius}
              fill={background}
            />
          )}
          <image
            href={logoDataUrl}
            x={geometry.logo.image.x}
            y={geometry.logo.image.y}
            width={geometry.logo.image.width}
            height={geometry.logo.image.height}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      )}
    </svg>
  );
}
