import type { C2PBankClave } from "./api";

/**
 * Los 22 bancos que admiten C2P, para la demo.
 *
 * **Generado desde el backend, no escrito a mano.** Sale de
 * `src/payments/c2pClaveGuide.js`, que a su vez transcribe la comunicación de
 * Mercantil a comercios. Para regenerarlo, en el repo del backend:
 *
 *     node -e "const {CLAVE_GUIDE}=require('./src/payments/c2pClaveGuide'); \
 *              const b=require('./src/payments/banks'); ..."
 *
 * Se hace así porque la versión anterior estaba escrita de memoria y tenía
 * **tres datos mal en una sola tarjeta**: le daba a Mercantil el código corto
 * 2383 (que es del Banco del Tesoro) y un vencimiento de cinco minutos (que es
 * de Banplus), cuando lo suyo es 24024 y seis horas. Unas instrucciones de
 * clave equivocadas no son un detalle estético: son un pago que no ocurre.
 *
 * Aquí viven **los hechos**; el texto que lee el comensal se compone abajo, en
 * español. Esa separación no es capricho: la API devuelve hoy esa prosa ya
 * escrita y **en inglés**, así que en producción quien elige Banesco lee "Sign
 * in to Banesco online banking". Arreglarlo va en el backend; mientras tanto,
 * la demo al menos no repite el fallo.
 */
type DemoBank = {
  code: string;
  name: string;
  /** Minutos de vida de la clave. `null` = hasta el cierre bancario. */
  ttl: number | null;
  /** La clave va atada al importe: si la cuenta cambia, muere. */
  bound?: boolean;
  app?: boolean;
  web?: boolean;
  sms?: string;
  smsText?: string;
  /** Movilnet usa otro código corto (Banfanb). */
  smsAlt?: string;
  /** Cómo escribirlo. No es parte del mensaje que se envía. */
  smsNote?: string;
};

const BANKS: DemoBank[] = [
  {
    code: "0156",
    name: "100% Banco",
    ttl: 360,
    bound: true,
    app: true,
    web: true,
    sms: "100102",
    smsText: "C2P PAGO <monto> <clave de operaciones especiales>",
  },
  { code: "0172", name: "Bancamiga", ttl: 180, app: true },
  { code: "0114", name: "Bancaribe", ttl: 360, app: true, sms: "22741", smsText: "CLAVEMIPAGO" },
  // El "(all uppercase)" venía pegado dentro del cuerpo del mensaje en la
  // guía: se enviaría literalmente. Es una nota sobre cómo escribirlo, no
  // parte del SMS, así que va aparte y en español.
  {
    code: "0171",
    name: "Banco Activo",
    ttl: 180,
    sms: "228486",
    smsText: "C2P<TIPO><numero de documento>",
    smsNote: "todo en mayúsculas",
  },
  { code: "0128", name: "Banco Caroní", ttl: 60, app: true },
  {
    code: "0102",
    name: "Banco de Venezuela",
    ttl: null,
    app: true,
    web: true,
    sms: "2661-2662",
    smsText: "Clave de pago",
  },
  {
    code: "0163",
    name: "Banco del Tesoro",
    ttl: 360,
    app: true,
    sms: "2383",
    smsText: "COMERCIO <TIPO> <numero de identificacion> <coordenada>",
  },
  { code: "0175", name: "Banco Digital de los Trabajadores", ttl: 360, app: true },
  { code: "0191", name: "Banco Nacional de Crédito", ttl: 360, web: true },
  {
    code: "0138",
    name: "Banco Plaza",
    ttl: 360,
    app: true,
    web: true,
    sms: "1470",
    smsText: "CLAVE <TIPO> <numero de identificacion>",
  },
  { code: "0168", name: "Bancrecer", ttl: 360, app: true },
  {
    code: "0134",
    name: "Banesco",
    ttl: 360,
    web: true,
    sms: "2846",
    smsText: "clave dinamica <TIPO> <numero de identificacion>",
  },
  {
    code: "0177",
    name: "Banfanb",
    ttl: 360,
    sms: "326200",
    smsText: "CLAVE C2P <TIPO> <numero de identificacion>",
    smsAlt: "78900",
  },
  { code: "0174", name: "Banplus", ttl: 5, app: true },
  { code: "0151", name: "BFC Banco Fondo Común", ttl: 360, app: true },
  { code: "0157", name: "DelSur", ttl: 360, sms: "78910", smsText: "COBROD2" },
  {
    code: "0115",
    name: "Exterior",
    ttl: 180,
    app: true,
    sms: "278",
    smsText: "CLAVE <TIPO> <numero de identificacion>",
  },
  { code: "0105", name: "Mercantil", ttl: 360, app: true, sms: "24024", smsText: "SCP" },
  { code: "0108", name: "Provincial", ttl: 180, app: true },
  {
    code: "0169",
    name: "R4, Banco Microfinanciero",
    ttl: 300,
    app: true,
    sms: "22622",
    smsText: "PAGAR",
  },
  { code: "0137", name: "Sofitasa", ttl: 360, app: true, web: true },
  { code: "0104", name: "Venezolano de Crédito", ttl: 360, app: true, web: true },
];

/** "6 horas", "5 minutos", o el caso sin número fijo. */
function ttlLabel(b: DemoBank): string {
  if (b.ttl === null) return "hasta el cierre bancario";
  if (b.ttl < 60) return `${b.ttl} minutos`;
  const h = b.ttl / 60;
  return `${h} ${h === 1 ? "hora" : "horas"}`;
}

/** Por debajo de esto, pedir la clave antes de sentarse no sirve. */
const SHORT_TTL = 60;

/**
 * Las instrucciones de cada banco, en español y con la identidad ya puesta.
 *
 * Recibe el tipo y el número que el comensal está tecleando para sustituirlos
 * en el cuerpo del SMS, igual que hace el servidor: un mensaje con
 * `<numero de identificacion>` dentro no se puede enviar.
 */
export function demoBanks(idType = "V", idNumber = ""): C2PBankClave[] {
  return BANKS.map((b) => {
    const channels: C2PBankClave["channels"] = [];
    if (b.app)
      channels.push({
        channel: "APP",
        text: `Abre la app de ${b.name} y busca su opción de clave de pago C2P`,
      });
    if (b.web)
      channels.push({
        channel: "WEB",
        text: `Entra a la banca en línea de ${b.name} y genera una clave de pago C2P`,
      });
    if (b.sms) {
      const body = (b.smsText ?? "")
        .replace(/<TIPO>/g, idType)
        .replace(/<numero de identificacion>|<numero de documento>/g, idNumber || "tu cédula");
      channels.push({
        channel: "SMS",
        shortCode: b.sms,
        smsBody: body,
        text: `Envía ${body} al ${b.sms}${b.smsNote ? ` — ${b.smsNote}` : ""}${b.smsAlt ? ` (${b.smsAlt} desde Movilnet)` : ""}`,
        altShortCode: b.smsAlt ?? null,
      });
    }
    const soon = b.bound || (b.ttl !== null && b.ttl < SHORT_TTL);
    return {
      bankCode: b.code,
      bankName: b.name,
      ttlMinutes: b.ttl,
      ttlLabel: ttlLabel(b),
      amountBound: Boolean(b.bound),
      strategy: {
        when: soon ? "at_payment" : "anytime",
        reason: b.bound
          ? "Este banco ata la clave al importe: pídela cuando el total sea el definitivo"
          : soon
            ? "La clave caduca enseguida: pídela justo antes de pagar"
            : "La clave dura horas: puedes pedirla mientras esperas",
      },
      channels,
    };
  });
}
