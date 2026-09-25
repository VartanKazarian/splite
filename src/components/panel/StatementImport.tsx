import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  bankConnections,
  type BankColumnMap,
  type BankConnection,
  type BankIngestResult,
  type BankMovementRow,
} from "@/lib/api";
import { detectDelimiter, guessColumns, parseStatement, type Delimiter } from "@/lib/statement";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Filas por llamada: lo que acepta el servidor. */
const BATCH = 500;

/**
 * Un fichero del banco en texto, sea UTF-8 o el Latin-1 que exportan muchos
 * bancos desde Windows. Con UTF-8 estricto, un fichero Latin-1 falla y se
 * vuelve a leer como tal; sin esto, «Transferencia recibida» salía con
 * caracteres rotos y la columna no se reconocía por su título.
 */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

type Totals = {
  inserted: number;
  duplicates: number;
  rejected: number;
  debits: number;
  skipped: number;
} & BankIngestResult["matches"];

/**
 * Subir el estado de cuenta del banco y cruzarlo con los avisos pendientes.
 *
 * Funciona con cualquier banco porque no presupone su formato: se propone qué
 * columna es cada dato (por el título o por el contenido) y la persona lo
 * confirma viendo cómo queda. El mapeo se recuerda para la próxima vez.
 */
export function StatementImport({
  connection,
  open,
  onOpenChange,
}: {
  connection: BankConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [delimiter, setDelimiter] = useState<Delimiter>(",");
  const [map, setMap] = useState<{
    reference: number | null;
    amount: number | null;
    date: number | null;
    description: number | null;
    hasHeader: boolean;
  }>({ reference: null, amount: null, date: null, description: null, hasHeader: true });
  const [pending, setPending] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);

  const reset = () => {
    setRows(null);
    setTotals(null);
  };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setTotals(null);
    const text = await readText(file);
    const saved = connection.columnMap;
    const d = (saved?.delimiter as Delimiter | null | undefined) ?? detectDelimiter(text);
    const parsed = parseStatement(text, d);
    if (parsed.length === 0) {
      toast.error(t("bankImportEmpty"));
      return;
    }
    setDelimiter(d);
    setRows(parsed);
    // El mapeo guardado manda si encaja con este fichero; si no, se adivina.
    const width = Math.max(...parsed.slice(0, 5).map((r) => r.length));
    if (saved && saved.reference < width && saved.amount < width) {
      setMap({
        reference: saved.reference,
        amount: saved.amount,
        date: saved.date ?? null,
        description: saved.description ?? null,
        hasHeader: saved.hasHeader ?? true,
      });
    } else {
      setMap(guessColumns(parsed));
    }
  }

  const body = useMemo(
    () => (rows ? (map.hasHeader ? rows.slice(1) : rows) : []),
    [rows, map.hasHeader],
  );
  const columns = useMemo(() => {
    if (!rows) return [];
    const width = Math.max(...rows.slice(0, 5).map((r) => r.length));
    return Array.from({ length: width }, (_, i) => {
      const title = map.hasHeader ? rows[0]?.[i] : undefined;
      const sample = body[0]?.[i];
      return { i, label: `${i + 1}. ${title || sample || "—"}`.slice(0, 40) };
    });
  }, [rows, body, map.hasHeader]);

  const cell = (r: string[], i: number | null) => (i == null ? "" : (r[i] ?? ""));
  const ready = map.reference != null && map.amount != null;

  async function runImport() {
    if (!ready) return;
    setPending(true);
    // Las filas sin nada en la columna del abono son salidas o renglones de
    // saldo: no se mandan, y se cuentan aparte para decirlo.
    const movements: BankMovementRow[] = [];
    let skipped = 0;
    for (const r of body) {
      const amount = cell(r, map.amount).trim();
      const reference = cell(r, map.reference).trim();
      if (!amount || !reference) {
        skipped += 1;
        continue;
      }
      movements.push({
        reference,
        amount,
        date: cell(r, map.date) || null,
        description: cell(r, map.description) || null,
      });
    }
    const columnMap: BankColumnMap = {
      reference: map.reference!,
      amount: map.amount!,
      date: map.date,
      description: map.description,
      delimiter,
      hasHeader: map.hasHeader,
    };
    const acc: Totals = {
      inserted: 0,
      duplicates: 0,
      rejected: 0,
      debits: 0,
      skipped,
      matched: 0,
      mismatch: 0,
      ambiguous: 0,
      notFound: 0,
      autoConfirmed: 0,
    };
    try {
      for (let start = 0; start < movements.length; start += BATCH) {
        const res = await bankConnections.importRows(
          connection.id,
          movements.slice(start, start + BATCH),
          start === 0 ? columnMap : undefined,
        );
        acc.inserted += res.inserted;
        acc.duplicates += res.duplicates;
        acc.debits += res.rejected.filter((x) => x.reason === "debit").length;
        acc.rejected += res.rejected.filter((x) => x.reason !== "debit").length;
        // La última tanda ve todos los movimientos: su conciliación es la buena.
        acc.matched = res.matches.matched;
        acc.mismatch = res.matches.mismatch;
        acc.ambiguous = res.matches.ambiguous;
        acc.notFound = res.matches.notFound;
        acc.autoConfirmed += res.matches.autoConfirmed;
      }
      setTotals(acc);
      void qc.invalidateQueries({ queryKey: ["payment-claims"] });
      void qc.invalidateQueries({ queryKey: ["payment-claims-summary"] });
      void qc.invalidateQueries({ queryKey: ["bank-connections"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? `${e.code} · ${e.message}` : t("apiUnreachable"));
    } finally {
      setPending(false);
    }
  }

  const select = (key: "reference" | "amount" | "date" | "description", optional: boolean) => (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{t(`bankCol_${key}`)}</span>
      <select
        value={map[key] ?? ""}
        onChange={(e) =>
          setMap((m) => ({ ...m, [key]: e.target.value === "" ? null : Number(e.target.value) }))
        }
        data-testid={`bank-map-${key}`}
        className="min-h-11 w-full min-w-0 truncate rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
      >
        {optional && <option value="">{t("bankColNone")}</option>}
        {!optional && map[key] == null && <option value="">{t("bankColPick")}</option>}
        {columns.map((c) => (
          <option key={c.i} value={c.i}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("bankImportTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("bankImportHint")}</p>

        {!totals && (
          <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-full border border-border-strong px-4 text-sm">
            <FileUp className="h-4 w-4" />
            {rows ? t("bankImportOtherFile") : t("bankImportChoose")}
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              data-testid="bank-import-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        )}

        {rows && !totals && (
          <div className="mt-2 grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {select("reference", false)}
              {select("amount", false)}
              {select("date", true)}
              {select("description", true)}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={map.hasHeader}
                onChange={(e) => setMap((m) => ({ ...m, hasHeader: e.target.checked }))}
              />
              {t("bankImportHasHeader")}
            </label>
            <p className="text-xs text-muted-foreground">{t("bankImportAmountHint")}</p>

            {/* Cómo queda, antes de mandar nada: tres filas bastan para ver si
                el importe está en la columna del abono o en la del saldo. */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-normal">{t("bankCol_date")}</th>
                    <th className="px-3 py-2 text-left font-normal">{t("bankCol_reference")}</th>
                    <th className="px-3 py-2 text-right font-normal">{t("bankCol_amount")}</th>
                  </tr>
                </thead>
                <tbody data-testid="bank-import-preview">
                  {body.slice(0, 3).map((r, k) => (
                    <tr key={k} className="border-t border-border">
                      <td className="px-3 py-2">{cell(r, map.date)}</td>
                      <td className="px-3 py-2 tabular-nums">{cell(r, map.reference)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{cell(r, map.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              disabled={!ready || pending}
              onClick={() => void runImport()}
              data-testid="bank-import-run"
              className="btn-primary w-full"
            >
              {pending ? t("loading") : t("bankImportRun").replace("{n}", String(body.length))}
            </button>
          </div>
        )}

        {totals && (
          <div
            className="mt-2 grid gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm"
            role="status"
            data-testid="bank-import-result"
          >
            <p className="font-medium">
              {t("bankImportDone")
                .replace("{new}", String(totals.inserted))
                .replace("{dup}", String(totals.duplicates))}
            </p>
            <p>
              {totals.autoConfirmed > 0
                ? t("bankImportConfirmed").replace("{n}", String(totals.autoConfirmed))
                : t("bankImportMatched").replace("{n}", String(totals.matched))}
            </p>
            {totals.ambiguous + totals.mismatch > 0 && (
              <p className="text-amber-800">
                {t("bankImportReview").replace("{n}", String(totals.ambiguous + totals.mismatch))}
              </p>
            )}
            {totals.rejected > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("bankImportRejected").replace("{n}", String(totals.rejected))}
              </p>
            )}
            {totals.debits + totals.skipped > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("bankImportSkipped").replace("{n}", String(totals.debits + totals.skipped))}
              </p>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn-primary mt-2 w-full"
            >
              {t("staffInviteDone")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
