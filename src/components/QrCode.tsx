import { useEffect, useRef, useState } from "react";

const COPPER = "#2C7A5C";

/** Marca al centro del QR (SVG inline como data URI). */
const BRAND_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="${COPPER}"/>
      <text x="32" y="44" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#ffffff">S</text>
    </svg>`,
  );

/**
 * QR premium: ojos en cobre de marca, resto negro puro, logo central y
 * corrección de errores alta ("H") para que siga siendo escaneable.
 */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const instance = useRef<unknown>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { default: QRCodeStyling } = await import("qr-code-styling");
      if (cancelled || !ref.current) return;

      const options = {
        width: size,
        height: size,
        type: "svg" as const,
        data: value,
        image: BRAND_LOGO,
        margin: 0,
        qrOptions: { errorCorrectionLevel: "H" as const },
        imageOptions: { crossOrigin: "anonymous", margin: 6, imageSize: 0.22 },
        dotsOptions: { color: "#000000", type: "square" as const },
        backgroundOptions: { color: "#ffffff" },
        cornersSquareOptions: { color: COPPER, type: "extra-rounded" as const },
        cornersDotOptions: { color: COPPER, type: "dot" as const },
      };

      if (instance.current) {
        (instance.current as { update: (o: typeof options) => void }).update(options);
      } else {
        const qr = new QRCodeStyling(options);
        ref.current.innerHTML = "";
        qr.append(ref.current);
        instance.current = qr;
      }
      setShown(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="inline-block rounded-[24px] border p-1 transition-all duration-500 ease-out"
      style={{
        borderColor: COPPER,
        boxShadow: `0 18px 45px -18px ${COPPER}80, 0 0 0 1px ${COPPER}33`,
        opacity: shown ? 1 : 0,
        transform: shown ? "scale(1)" : "scale(0.94)",
      }}
    >
      <div className="rounded-[18px] bg-white p-2">
        <div ref={ref} style={{ width: size, height: size }} />
      </div>
    </div>
  );
}
