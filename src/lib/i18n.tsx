import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const dict = {
  es: {
    brand: "Mesa",
    tagline: "Pagar la cuenta del restaurante en 30 segundos",
    heroSub:
      "Un QR por mesa. El cliente ve la cuenta, la divide, deja propina y paga. El POS se cierra solo.",
    ctaDemo: "Ver demo de cliente",
    ctaLogin: "Entrar al panel",
    f1: "QR por mesa",
    f1d: "Un código permanente por mesa que identifica restaurante y cuenta abierta.",
    f2: "Dividir la cuenta",
    f2d: "Por productos, entre personas, por porcentaje o monto personalizado.",
    f3: "Pagos locales",
    f3d: "Pago Móvil, tarjeta, Apple Pay y Google Pay en la misma pantalla.",
    f4: "Conector POS",
    f4d: "Lee la factura abierta y marca los ítems pagados automáticamente.",
    demoNote: "Prototipo visual con datos de ejemplo.",
    login: "Iniciar sesión",
    loginSub: "Acceso al panel del restaurante",
    email: "Correo",
    password: "Contraseña",
    enter: "Entrar",
    logout: "Salir",
    dashboard: "Panel",
    tables: "Mesas",
    openBill: "Cuenta abierta",
    free: "Libre",
    paid: "Pagada",
    partial: "Parcial",
    viewTable: "Ver mesa",
    qrFor: "QR de la mesa",
    todaySales: "Ventas de hoy",
    avgTip: "Propina promedio",
    openTables: "Mesas abiertas",
    tickets: "Cuentas cerradas",
    table: "Mesa",
    yourBill: "Tu cuenta",
    items: "Productos",
    payAll: "Pagar todo",
    splitItems: "Elegir productos",
    splitEven: "Dividir en partes",
    custom: "Monto personalizado",
    people: "Personas",
    tip: "Propina",
    subtotal: "Subtotal",
    total: "Total a pagar",
    payNow: "Pagar",
    payWith: "Pagar con",
    card: "Tarjeta",
    mobile: "Pago Móvil",
    alreadyPaid: "Pagado",
    remaining: "Pendiente",
    thanks: "¡Gracias!",
    thanksSub: "Tu pago fue aprobado y la cuenta se actualizó en el POS.",
    receipt: "Recibo enviado por correo",
    backToBill: "Volver a la cuenta",
    yourShare: "Tu parte",
    selectSome: "Selecciona al menos un producto",
    taxBase: "Base imponible",
    service: "Servicio (10%)",
    iva: "IVA (16%)",
    igtf: "IGTF (3%)",
    igtfNote: "Aplica al pagar en divisas",
    tipNote: "La propina es voluntaria y no genera IVA",
    vesEquivalent: "Equivalente en Bs.",
    bcvRate: "Tasa BCV",
    settlementNote: "La liquidación se hace en bolívares a la tasa congelada al abrir la cuenta.",
    breakdown: "Desglose",
  },
  en: {
    brand: "Mesa",
    tagline: "Settle the restaurant bill in 30 seconds",
    heroSub:
      "One QR per table. Guests view the bill, split it, tip and pay. The POS closes itself.",
    ctaDemo: "See guest demo",
    ctaLogin: "Go to dashboard",
    f1: "QR per table",
    f1d: "A permanent code per table identifying the venue and the open bill.",
    f2: "Split the bill",
    f2d: "By item, evenly between people, by percentage or a custom amount.",
    f3: "Local payments",
    f3d: "Pago Móvil, cards, Apple Pay and Google Pay on the same screen.",
    f4: "POS connector",
    f4d: "Reads the open ticket and marks paid items automatically.",
    demoNote: "Visual prototype with sample data.",
    login: "Sign in",
    loginSub: "Restaurant dashboard access",
    email: "Email",
    password: "Password",
    enter: "Enter",
    logout: "Sign out",
    dashboard: "Dashboard",
    tables: "Tables",
    openBill: "Open bill",
    free: "Free",
    paid: "Paid",
    partial: "Partial",
    viewTable: "View table",
    qrFor: "Table QR",
    todaySales: "Sales today",
    avgTip: "Average tip",
    openTables: "Open tables",
    tickets: "Closed tickets",
    table: "Table",
    yourBill: "Your bill",
    items: "Items",
    payAll: "Pay everything",
    splitItems: "Pick items",
    splitEven: "Split evenly",
    custom: "Custom amount",
    people: "People",
    tip: "Tip",
    subtotal: "Subtotal",
    total: "Total to pay",
    payNow: "Pay",
    payWith: "Pay with",
    card: "Card",
    mobile: "Pago Móvil",
    alreadyPaid: "Paid",
    remaining: "Remaining",
    thanks: "Thank you!",
    thanksSub: "Your payment was approved and the POS bill was updated.",
    receipt: "Receipt sent by email",
    backToBill: "Back to bill",
    yourShare: "Your share",
    selectSome: "Select at least one item",
  },
} as const;

export type Key = keyof (typeof dict)["es"];

const Ctx = createContext<{ lang: Lang; t: (k: Key) => string; setLang: (l: Lang) => void }>({
  lang: "es",
  t: (k) => dict.es[k],
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("es");
  useEffect(() => {
    const stored = window.localStorage.getItem("mesa-lang");
    if (stored === "en" || stored === "es") setLang(stored);
  }, []);
  const update = (l: Lang) => {
    setLang(l);
    window.localStorage.setItem("mesa-lang", l);
  };
  return (
    <Ctx.Provider value={{ lang, setLang: update, t: (k) => dict[lang][k] }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
