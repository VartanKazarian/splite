/** Decorative deterministic QR-style code used for the visual prototype. */
export function QrCode({ value, size = 148 }: { value: string; size?: number }) {
  const modules = 21;
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) % 100000;

  const rand = (i: number) => {
    const x = Math.sin(seed + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const isFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= modules - 7) || (r >= modules - 7 && c < 7);

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (isFinder(r, c)) continue;
      if (rand(r * modules + c) > 0.52) cells.push({ r, c });
    }
  }

  const finder = (r: number, c: number) => (
    <g key={`f${r}-${c}`}>
      <rect x={c} y={r} width={7} height={7} rx={1.4} fill="currentColor" />
      <rect
        x={c + 1}
        y={r + 1}
        width={5}
        height={5}
        rx={1}
        fill="var(--color-card)"
        stroke="none"
      />
      <rect x={c + 2} y={r + 2} width={3} height={3} rx={0.6} fill="currentColor" />
    </g>
  );

  return (
    <svg
      viewBox={`-1 -1 ${modules + 2} ${modules + 2}`}
      width={size}
      height={size}
      className="text-foreground"
      role="img"
      aria-label={`QR ${value}`}
    >
      <rect
        x={-1}
        y={-1}
        width={modules + 2}
        height={modules + 2}
        rx={2}
        fill="var(--color-card)"
      />
      {finder(0, 0)}
      {finder(0, modules - 7)}
      {finder(modules - 7, 0)}
      {cells.map(({ r, c }) => (
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} rx={0.25} fill="currentColor" />
      ))}
    </svg>
  );
}
