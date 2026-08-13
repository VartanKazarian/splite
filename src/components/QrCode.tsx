import { QRCodeSVG } from "qrcode.react";

/**
 * QR real (SVG) para escanear con la cámara del móvil.
 * Nivel M, zona de silencio, negro puro sobre blanco puro, sin logo ni degradado.
 */
export function QrCode({ value, size = 240 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-lg bg-white p-3">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={2}
        bgColor="#ffffff"
        fgColor="#000000"
      />
    </div>
  );
}
