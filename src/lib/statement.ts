/**
 * Un estado de cuenta del banco, leído en el navegador.
 *
 * Cada banco exporta a su manera: con coma, punto y coma, tabulador o barra;
 * con o sin títulos; con el abono en su propia columna o con el signo. Aquí
 * sólo se parte el fichero en filas y columnas y se adivina qué columna es
 * cada dato para proponérselo a la persona, que lo confirma. Leer los importes
 * y las fechas es trabajo del servidor, que valida fila a fila: el navegador
 * manda el texto tal cual, para que haya un único sitio que interpreta dinero.
 */

export type Delimiter = "," | ";" | "\t" | "|";

/** El separador que más columnas estables da en las primeras líneas. */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 10);
  const candidates: Delimiter[] = [";", "\t", "|", ","];
  let best: Delimiter = ",";
  let bestScore = 0;
  for (const d of candidates) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const min = Math.min(...counts);
    // Tantas columnas como sea posible, y las mismas en todas las líneas.
    const stable = counts.every((c) => c === counts[0]);
    const score = min > 1 ? min * (stable ? 2 : 1) : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Una línea en celdas, respetando comillas («"Pérez; Hnos."» es una celda). */
export function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseStatement(
  text: string,
  delimiter: Delimiter = detectDelimiter(text),
): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => splitLine(l, delimiter));
}

export type Guess = {
  reference: number | null;
  amount: number | null;
  date: number | null;
  description: number | null;
  hasHeader: boolean;
};

/**
 * Qué columna parece cada dato, por los títulos si los hay y si no por el
 * contenido. Es una propuesta: la persona la ve y la cambia.
 */
export function guessColumns(rows: string[][]): Guess {
  const header = rows[0] ?? [];
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  // Por orden de preferencia: «Monto Débito;Monto Crédito» tiene que dar la
  // segunda aunque las dos digan «monto», así que un título de salida no vale
  // nunca como importe.
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = header.findIndex(
        (h) => re.test(norm(h)) && !/debito|debe|cargo|egreso/.test(norm(h)),
      );
      if (i >= 0) return i;
    }
    return null;
  };
  // Una fila de títulos tiene palabras y ninguna celda que empiece por cifra:
  // «24/09/2026|12345678|TRANSF RECIBIDA» es ya un movimiento.
  const hasHeader =
    header.some((h) => /[a-z]{3,}/i.test(h)) && header.every((h) => !/^-?\d/.test(h));
  if (hasHeader) {
    return {
      reference: find(/refer/, /comprob/, /nro|numero|n°/),
      amount: find(/abono|credito|haber|ingreso/, /monto|importe/),
      date: find(/fecha|date/),
      description: find(/descrip|concepto|detalle/),
      hasHeader: true,
    };
  }
  // Sin títulos: la fecha tiene barras, el importe coma o punto decimal, la
  // referencia es la columna de dígitos más larga.
  const sample = rows.slice(0, 5);
  const col = (test: (v: string) => boolean) => {
    const width = Math.max(...sample.map((r) => r.length));
    for (let i = 0; i < width; i++) if (sample.every((r) => test(r[i] ?? ""))) return i;
    return null;
  };
  return {
    date: col((v) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(v)),
    amount: col((v) => /^-?[\d.,]+[.,]\d{2}$/.test(v)),
    reference: col((v) => /^\d{6,}$/.test(v.replace(/\D/g, "")) && !/[/,]/.test(v)),
    description: col((v) => /[a-z]{4,}/i.test(v)),
    hasHeader: false,
  };
}
