import { browserLang, storedLang } from "@/lib/stored-lang";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "es" | "en";

const dict = {
  es: {
    // El producto se llama Splite: es el dominio, la web y lo que dice la
    // pantalla de pago ("Splite no cobra el pago"). "Mesa" era el nombre de
    // antes y se quedó aquí, así que la aplicación se presentaba con un
    // nombre distinto al de todo lo demás -- y a un comensal "Mesa" le suena
    // a etiqueta de su mesa, no a quién le está cobrando.
    brand: "Splite",
    email: "Correo",
    password: "Contraseña",
    logout: "Salir",
    dashboard: "Panel",
    tables: "Mesas",
    openBill: "Cuenta abierta",
    free: "Libre",
    qrFor: "QR de la mesa",
    payAll: "Pagar toda la cuenta",
    tip: "Propina",
    subtotal: "Subtotal",
    total: "Total",
    alreadyPaid: "Pagado",
    totalInVesAtRate: "En bolívares, a {rate} Bs por {symbol}",
    taxBase: "Base imponible",
    service: "Servicio",
    iva: "IVA",
    // "VES" es un código ISO: existe para que dos sistemas se entiendan, no
    // para que lo lea alguien sentado a una mesa.
    currencyVES: "bolívares",
    currencyUSD: "dólares",
    currencyEUR: "euros",
    line_one: "línea",
    line_other: "líneas",
    unavailable: "No disponible",
    reference: "Referencia",
    oneOpenBill: "Una sola cuenta abierta por mesa",
    payments: "Pagos registrados",
    methodCASH: "Efectivo",
    methodCARD: "Tarjeta",
    methodTRANSFER: "Transferencia",
    methodPAGO_MOVIL: "Pago Móvil",
    methodSPLITE: "Splite",
    methodOTHER: "Otro",
    // Un solo vocabulario. La cabecera decía "Propietario / Gerente / Cajero /
    // Mesonero" y la lista de personal "Dueño / Encargado / Caja / Mesero":
    // los mismos cuatro roles con dos juegos de nombres en el mismo producto.
    // Gana el de la lista, que es el que explica la propia pantalla de equipo.
    roleOWNER: "Dueño",
    roleMANAGER: "Encargado",
    roleCASHIER: "Caja",
    roleWAITER: "Mesero",
    loading: "Cargando…",
    retry: "Reintentar",
    takePayment: "Registrar pago",
    refreshQr: "Rotar QR",
    currencyMismatch: "La cuenta se liquida en otra moneda",
    currencyMismatchHint:
      "Solo puedes añadir productos en la moneda de la cuenta. Ajusta la moneda del menú o el precio del producto.",
    copyLink: "Copiar enlace",
    qrScanHint: "Escanea para ver tu cuenta",
    printQr: "Imprimir QR",
    rotateQrWarning:
      "Esto invalidará el código impreso de esta mesa. Tendrás que imprimirlo de nuevo. ¿Continuar?",
    continue: "Continuar",
    linkCopied: "Enlace copiado",
    outstanding: "Falta por pagar",
    feedbackTitle: "Opiniones · 30 días",
    feedbackEmpty: "Todavía no hay. Los comensales valoran al terminar de pagar desde el QR.",
    feedbackCount: "de {n} opiniones",
    name: "Nombre",
    setupTitle: "Para empezar a trabajar",
    setupTables: "Crea tus mesas",
    setupTablesWhy: "Cada mesa tiene su propio código. Sin mesas no hay nada que imprimir.",
    setupMenu: "Pon la carta",
    setupMenuWhy: "Quien escanee verá «todavía no hay carta» hasta que haya platos o un PDF.",
    setupPayout: "Di dónde cobras",
    setupPayoutWhy:
      "Sin estos datos, quien elija Pago Móvil en la mesa no ve a dónde mandar el dinero.",
    payoutMissingQr: "Sin datos de cobro. Quien escanee esta mesa no podrá pagar por Pago Móvil.",
    payoutConfigure: "Configurar",
    planTrialEndsDays: "Quedan {days} días de prueba.",
    planTrialEndsOneDay: "Queda 1 día de prueba.",
    planTrialEnded: "Tu prueba terminó el {date}. No se ha desactivado nada.",
    planSeePlan: "Ver tu plan",
    planTierLabel: "Plan",
    planTierTRIAL: "Prueba",
    planTierSTARTER: "Starter",
    planTierPRO: "Pro",
    planTierENTERPRISE: "Enterprise",
    previewOpenReal: "Abrir en una mesa real",
    qrEphemeralHost:
      "Estás en una vista previa. Un código impreso desde aquí dejaría de funcionar al caducar la vista previa, así que imprimir está desactivado. Abre el panel en la dirección definitiva del restaurante para imprimirlo.",
    feedSettled: "Cobro",
    feedDeclared: "Aviso de pago",
    roleOwnerWhat: "Todo, incluidas las credenciales de cobro",
    roleManagerWhat: "El menú, las mesas y el personal por debajo suyo",
    roleCashierWhat: "Cobrar y verificar avisos de pago",
    roleWaiterWhat: "Abrir cuentas y añadir productos",
    // --- Panel operativo -------------------------------------------------
    greetMorning: "Buenos días",
    greetAfternoon: "Buenas tardes",
    greetEvening: "Buenas noches",
    greetSub: "Aquí tienes el estado de {name}.",
    liveNow: "En vivo",
    liveStale: "Sin conexión",
    account: "Cuenta",
    setupConfigure: "Configurar",
    pendingCollection: "Pendiente de cobro",
    kpiTakenTodayShort: "Ventas hoy",
    salesSplit: "App {app} · caja {till}",
    salesSplitUnclassified: "App {app} · caja {till} · sin clasificar {rest}",
    orderTray: "Pedidos desde la mesa",
    chimeOn: "Sonido activado",
    chimeOff: "Sonido silenciado",
    chimeBlocked: "El sonido de los pedidos está apagado. Toca aquí para activarlo.",
    chimeBlockedHint: "El navegador no deja sonar hasta que alguien toca la pantalla.",
    tabletMode: "Modo tablet",
    tabletModeHint: "Pantalla encendida y aviso que se repite",
    orderSeen: "Visto",
    orderMine: "Lo atiendo yo",
    orderMineDone: "Mesa a tu nombre",
    orderMineTaken: "Otra persona se puso esta mesa antes.",
    orderLineRemoved: "{n} líneas ya no están en la cuenta",
    orderLineRemovedOne: "1 línea ya no está en la cuenta",
    justNow: "ahora mismo",
    agoMin: "hace {n} min",
    agoHour: "hace {n} h",
    orderHeldBadge: "Teléfono nuevo · aprobar",
    orderHeldHint: "Todavía no está en ninguna cuenta. Comprueba que hay alguien en la mesa.",
    orderApprove: "Aprobar",
    orderReject: "Rechazar",
    orderApproved: "Pedido aprobado y en la cuenta",
    orderRejected: "Pedido rechazado",
    offlineBanner: "Sin conexión a internet. La página se pondrá al día sola cuando vuelva.",
    orderNote: "Nota del comensal",
    badgeClaims: "por verificar",
    badgeApproval: "Pedido por aprobar",
    badgePayingNow: "Pagando ahora",
    badgeStale: "{n} h abierta",
    badgePartly: "Pago parcial",
    oldestHint: "la más vieja, {age}",
    liveTables: "Mesas abiertas",
    allTablesLink: "Ver las {n} mesas",
    moreOpenTables: "Estas son {shown} de {n} abiertas · verlas todas",
    noOpenTables: "Ninguna mesa abierta",
    noOpenTablesHint: "Cuando alguien abra una cuenta aparecerá aquí.",
    tableFreeShort: "Libre",
    tableOpenShort: "Abierta",
    paidOf: "{paid} de {total} cobrado",
    registerPayment: "Registrar pago",
    addProducts: "Añadir productos",
    howMuchReceived: "¿Cuánto se recibió?",
    pendingAfterPayment: "Pendiente después del pago",
    attentionTitle: "Por atender",
    attentionOldBill: "{table} lleva {age} abierta",
    attentionOldBills: "{n} cuentas llevan más de {age} abiertas",
    attentionClaims: "{n} pagos por verificar",
    attentionClaimsOne: "1 pago por verificar en {table}",
    attentionOrders: "{n} pedidos sin ver",
    attentionOrdersOne: "1 pedido sin ver",
    attentionGoTray: "Ver la bandeja",
    attentionGoPayments: "Ir a Pagos",
    attentionGoTables: "Ver las mesas",
    displayName: "Tu nombre",
    displayNameFailed: "No pudimos guardar el nombre.",
    nameNudgeLabel: "¿Cómo te llamas?",
    nameNudgeHint: "Sale en «Atendida por» y en el reparto de propinas.",
    nameNudgeLater: "Ahora no",
    tablesNav: "Mesas",
    qrOfTable: "QR de la mesa",
    tableActions: "Acciones de la mesa",
    payMethod: "Forma de pago",
    attentionC2P: "{n} C2P sin resolver",
    tablesCouldNotLoad: "No pudimos cargar las mesas.",
    tryAgain: "Intenta de nuevo.",
    feedTitle: "Movimiento",
    feedBillTitle: "Movimientos recientes",
    feedEmpty: "Todavía no ha pasado nada hoy.",
    feedOther: "Movimiento",
    kpiOpenTables: "Mesas ocupadas",
    payment_one: "cobro",
    payment_other: "cobros",
    bill_one: "cuenta",
    bill_other: "cuentas",
    tillRetrySafe: "Si algo se corta a medias, vuelve a intentarlo: no se cobra dos veces.",
    paymentsNav: "Pagos",
    restaurantName: "Nombre del restaurante",
    apiDown: "No hay conexión con el servidor de Splite.",
    openNewBill: "Abrir cuenta",
    billOpened: "Cuenta abierta",
    manageMenu: "Menú",
    oneMoreOf: "Una unidad más de",
    oneLessOf: "Una unidad menos de",
    lineAdded: "Producto añadido",
    lineRemoved: "Producto eliminado",
    remove: "Quitar",
    save: "Guardar",
    addLines: "Añadir productos del menú",
    chooseProducts: "Seleccionar productos",
    searchProduct: "Buscar producto…",
    addSelected: "Añadir a la cuenta",
    cartUnits: "{n} unidades elegidas",
    cartUnitsOne: "1 unidad elegida",
    noResults: "Sin resultados",
    taxTAXABLE: "Gravado (IVA general)",
    taxEXEMPT: "Exento",
    taxEXONERATED: "Exonerado",
    taxNON_TAXABLE: "No sujeto",
    taxHint: "Casi todo va gravado. Cámbialo solo si tu contador te lo indica.",
    cancel: "Cancelar",
    close: "Cerrar",
    saved: "Cambios guardados",
    payHint: "Solo si el cliente no paga desde su móvil",
    paidProgress: "{paid} cobrado de {total}",
    payStateWaiting: "Esperando el pago del cliente",
    payStateClaims_one: "1 aviso de pago por verificar",
    payStateClaims_other: "{n} avisos de pago por verificar",
    payStatePartial: "Pagada en parte",
    payStateSettled: "Pagada del todo",
    payStateVerify: "Verificar",
    tillOverLabel: "Sobran",
    tillOverAsTip: "Propina",
    tillOverAsChange: "Cambio",
    tillOverTipNote: "Se registra como propina; la cuenta solo recibe lo que falta.",
    tillOverChangeNote: "Devuelve {amount} al cliente; se cobra solo lo que falta.",
    tillTipToast: "propina",
    receiptTable: "Mesa",
    payoutBank: "Banco",
    payoutPhone: "Teléfono afiliado",
    filterAllSections: "Todas las secciones",
    servedBy: "Atendida por",
    servedByAria: "Quién atendió esta mesa",
    servedByNone: "Sin asignar",
    servedByNobody: "Sin mesero asignado",
    servedByUnknown: "Quien la atendió (ya no activo)",
    serverGone: "Esa persona ya no trabaja aquí o está dada de baja",
    serverForbidden: "Solo el dueño o un encargado puede cambiar quién atendió",
    closeBill: "Anular cuenta",
    closeBillConfirm: "Se anulará la cuenta abierta de esta mesa y quedará libre. ¿Continuar?",
    settleBill: "Cerrar cuenta",
    settleTitle: "Cerrar cuenta",
    settleBody:
      "Se cobraron {paid} de {total}. La mesa queda libre y los {missing} que faltan se registran como:",
    settleBodySquared: "La cuenta está cobrada entera. Se cierra y la mesa queda libre.",
    settleReasonDiscount: "Descuento",
    settleReasonDiscountWhy: "Una rebaja acordada con la mesa.",
    settleReasonComp: "Cortesía",
    settleReasonCompWhy: "Invita la casa.",
    settleReasonWriteOff: "Incobrable",
    settleReasonWriteOffWhy: "Dinero que no se va a cobrar.",
    settleNote: "Nota (opcional)",
    settleNotePlaceholder: "Se fueron sin pagar el resto",
    settleDone: "Cuenta cerrada · {amount} sin cobrar",
    billClosed: "Cuenta cerrada",
    renameTable: "Renombrar mesa",
    tableRenamed: "Mesa renombrada",
    deleteTable: "Eliminar mesa",
    deleteTableConfirm: "La mesa se desactivará y dejará de aparecer en el panel. ¿Continuar?",
    tableDeleted: "Mesa eliminada",
    settings: "Configuración",
    charges: "Tarifas",
    currencyBlocked:
      "{n} producto(s) activo(s) tienen precio en otra moneda. Desactívalos o elimínalos para cambiar.",
    bankCol_reference: "Referencia",
    bankCol_amount: "Importe del abono",
    bankCol_date: "Fecha",
    bankCol_description: "Descripción",
    bankField_amount: "importe",
    bankField_bank: "banco",
    bankField_phone: "teléfono",
    bankField_id: "cédula",
    subBannerOverdue: "Tienes un pago de tu suscripción a Splite vencido.",
    subBannerSuspended:
      "Tu suscripción a Splite está suspendida: no se pueden abrir cuentas nuevas.",
    subBannerSee: "Ver suscripción",
  },
  en: {
    brand: "Splite",
    email: "Email",
    password: "Password",
    logout: "Sign out",
    dashboard: "Dashboard",
    tables: "Tables",
    openBill: "Open bill",
    free: "Free",
    qrFor: "Table QR",
    payAll: "Pay the whole bill",
    tip: "Tip",
    subtotal: "Subtotal",
    total: "Total",
    alreadyPaid: "Paid",
    totalInVesAtRate: "In bolívares, at {rate} Bs per {symbol}",
    taxBase: "Taxable base",
    service: "Service",
    iva: "VAT",
    currencyVES: "bolívares",
    currencyUSD: "dollars",
    currencyEUR: "euros",
    line_one: "line",
    line_other: "lines",
    unavailable: "Unavailable",
    reference: "Reference",
    oneOpenBill: "At most one open bill per table",
    payments: "Recorded payments",
    methodCASH: "Cash",
    methodCARD: "Card",
    methodTRANSFER: "Transfer",
    methodPAGO_MOVIL: "Pago Móvil",
    methodSPLITE: "Splite",
    methodOTHER: "Other",
    roleOWNER: "Owner",
    roleMANAGER: "Manager",
    roleCASHIER: "Cashier",
    roleWAITER: "Waiter",
    loading: "Loading…",
    retry: "Retry",
    takePayment: "Record payment",
    refreshQr: "Rotate QR",
    currencyMismatch: "This bill settles in a different currency",
    currencyMismatchHint:
      "You can only add products priced in the bill currency. Change the menu currency or the product price.",
    copyLink: "Copy link",
    qrScanHint: "Scan to view your bill",
    printQr: "Print QR",
    rotateQrWarning:
      "This will invalidate the printed code for this table. You will have to print it again. Continue?",
    continue: "Continue",
    linkCopied: "Link copied",
    outstanding: "Left to pay",
    feedbackTitle: "Feedback · 30 days",
    feedbackEmpty: "None yet. Diners rate when they finish paying from the QR.",
    feedbackCount: "from {n} ratings",
    name: "Name",
    setupTitle: "Before you can trade",
    setupTables: "Create your tables",
    setupTablesWhy: "Each table has its own code. With no tables there is nothing to print.",
    setupMenu: "Put up the menu",
    setupMenuWhy: "Anyone who scans sees “no menu yet” until there are dishes or a PDF.",
    setupPayout: "Say where you get paid",
    setupPayoutWhy:
      "Without these, a diner who picks Pago Móvil is not shown anywhere to send the money.",
    payoutMissingQr: "No payee set. Whoever scans this table cannot pay by Pago Móvil.",
    payoutConfigure: "Set it up",
    planTrialEndsDays: "{days} days left of your trial.",
    planTrialEndsOneDay: "1 day left of your trial.",
    planTrialEnded: "Your trial ended on {date}. Nothing has been switched off.",
    planSeePlan: "See your plan",
    planTierLabel: "Plan",
    planTierTRIAL: "Trial",
    planTierSTARTER: "Starter",
    planTierPRO: "Pro",
    planTierENTERPRISE: "Enterprise",
    previewOpenReal: "Open on a real table",
    qrEphemeralHost:
      "You are on a preview deployment. A code printed from here would stop working once the preview expires, so printing is disabled. Open the panel on the restaurant's final address to print it.",
    feedSettled: "Payment",
    feedDeclared: "Payment notice",
    roleOwnerWhat: "Everything, including the payout credentials",
    roleManagerWhat: "The menu, the tables and the staff below them",
    roleCashierWhat: "Take payment and verify payment notices",
    roleWaiterWhat: "Open bills and add dishes",
    // --- Operational panel ------------------------------------------------
    greetMorning: "Good morning",
    greetAfternoon: "Good afternoon",
    greetEvening: "Good evening",
    greetSub: "Here is how {name} is doing.",
    liveNow: "Live",
    liveStale: "Offline",
    account: "Account",
    setupConfigure: "Set up",
    pendingCollection: "Pending collection",
    kpiTakenTodayShort: "Sales today",
    salesSplit: "App {app} · till {till}",
    salesSplitUnclassified: "App {app} · till {till} · unclassified {rest}",
    orderTray: "Orders from the table",
    chimeOn: "Sound on",
    chimeOff: "Sound muted",
    chimeBlocked: "Order sounds are off. Tap here to turn them on.",
    chimeBlockedHint: "The browser keeps sound muted until someone touches the screen.",
    tabletMode: "Tablet mode",
    tabletModeHint: "Screen stays on, alert repeats",
    orderSeen: "Seen",
    orderMine: "I am taking this",
    orderMineDone: "The table is yours",
    orderMineTaken: "Somebody else took this table first.",
    orderLineRemoved: "{n} lines are no longer on the bill",
    orderLineRemovedOne: "1 line is no longer on the bill",
    justNow: "just now",
    agoMin: "{n} min ago",
    agoHour: "{n} h ago",
    orderHeldBadge: "New phone · approve",
    orderHeldHint: "Not on any bill yet. Check someone is at the table.",
    orderApprove: "Approve",
    orderReject: "Reject",
    orderApproved: "Order approved and on the bill",
    orderRejected: "Order rejected",
    offlineBanner: "No internet connection. The page will catch up by itself when it's back.",
    orderNote: "Diner's note",
    badgeClaims: "to verify",
    badgeApproval: "Order to approve",
    badgePayingNow: "Paying now",
    badgeStale: "{n} h open",
    badgePartly: "Partly paid",
    oldestHint: "oldest {age}",
    liveTables: "Open tables",
    allTablesLink: "See all {n} tables",
    moreOpenTables: "Showing {shown} of {n} open · see them all",
    noOpenTables: "No table is open",
    noOpenTablesHint: "A table shows up here when someone opens a bill.",
    tableFreeShort: "Free",
    tableOpenShort: "Open",
    paidOf: "{paid} of {total} collected",
    registerPayment: "Register payment",
    addProducts: "Add products",
    howMuchReceived: "How much was received?",
    pendingAfterPayment: "Pending after this payment",
    attentionTitle: "Needs attention",
    attentionOldBill: "{table} has been open {age}",
    attentionOldBills: "{n} bills have been open over {age}",
    attentionClaims: "{n} payments to verify",
    attentionClaimsOne: "1 payment to verify on {table}",
    attentionOrders: "{n} orders not seen",
    attentionOrdersOne: "1 order not seen",
    attentionGoTray: "See the tray",
    attentionGoPayments: "Go to Payments",
    attentionGoTables: "See the tables",
    displayName: "Your name",
    displayNameFailed: "We could not save the name.",
    nameNudgeLabel: "What is your name?",
    nameNudgeHint: "It shows in “Served by” and in the tip split.",
    nameNudgeLater: "Not now",
    tablesNav: "Tables",
    qrOfTable: "Table QR",
    tableActions: "Table actions",
    payMethod: "Payment method",
    attentionC2P: "{n} unresolved C2P",
    tablesCouldNotLoad: "We could not load the tables.",
    tryAgain: "Try again.",
    feedTitle: "Activity",
    feedBillTitle: "Recent movements",
    feedEmpty: "Nothing has happened yet today.",
    feedOther: "Activity",
    kpiOpenTables: "Tables in service",
    payment_one: "payment",
    payment_other: "payments",
    bill_one: "bill",
    bill_other: "bills",
    tillRetrySafe: "If something cuts out halfway, just try again: it will not charge twice.",
    paymentsNav: "Payments",
    restaurantName: "Restaurant name",
    apiDown: "No connection to the Splite server.",
    openNewBill: "Open a bill",
    billOpened: "Bill opened",
    manageMenu: "Menu",
    oneMoreOf: "One more of",
    oneLessOf: "One fewer of",
    lineAdded: "Line added",
    lineRemoved: "Line removed",
    remove: "Remove",
    save: "Save",
    addLines: "Add products from the menu",
    chooseProducts: "Select products",
    searchProduct: "Search product…",
    addSelected: "Add to bill",
    cartUnits: "{n} units chosen",
    cartUnitsOne: "1 unit chosen",
    noResults: "No results",
    taxTAXABLE: "Taxable (standard VAT)",
    taxEXEMPT: "Exempt",
    taxEXONERATED: "Exonerated",
    taxNON_TAXABLE: "Not subject to VAT",
    taxHint: "Almost everything is taxable. Change it only if your accountant tells you to.",
    cancel: "Cancel",
    close: "Close",
    saved: "Changes saved",
    payHint: "Only if the diner does not pay from their phone",
    paidProgress: "{paid} collected of {total}",
    payStateWaiting: "Waiting for the diner to pay",
    payStateClaims_one: "1 payment notice to verify",
    payStateClaims_other: "{n} payment notices to verify",
    payStatePartial: "Partly paid",
    payStateSettled: "Paid in full",
    payStateVerify: "Verify",
    tillOverLabel: "Left over",
    tillOverAsTip: "Tip",
    tillOverAsChange: "Change",
    tillOverTipNote: "Recorded as a tip; the bill only takes what it is owed.",
    tillOverChangeNote: "Hand {amount} back; only what the bill is owed is charged.",
    tillTipToast: "tip",
    receiptTable: "Table",
    payoutBank: "Bank",
    payoutPhone: "Registered phone",
    filterAllSections: "All sections",
    servedBy: "Served by",
    servedByAria: "Who served this table",
    servedByNone: "Unassigned",
    servedByNobody: "No server assigned",
    servedByUnknown: "Whoever served it (no longer active)",
    serverGone: "That person no longer works here, or has been deactivated",
    serverForbidden: "Only the owner or a manager can change who served a table",
    closeBill: "Void bill",
    closeBillConfirm: "The open bill for this table will be voided and the table freed. Continue?",
    settleBill: "Close bill",
    settleTitle: "Close bill",
    settleBody:
      "{paid} collected of {total}. The table is freed and the {missing} still owed is recorded as:",
    settleBodySquared: "The bill is fully paid. It closes and the table is freed.",
    settleReasonDiscount: "Discount",
    settleReasonDiscountWhy: "A reduction agreed with the table.",
    settleReasonComp: "On the house",
    settleReasonCompWhy: "The restaurant is paying.",
    settleReasonWriteOff: "Written off",
    settleReasonWriteOffWhy: "Money that will not be collected.",
    settleNote: "Note (optional)",
    settleNotePlaceholder: "They left without paying the rest",
    settleDone: "Bill closed · {amount} not collected",
    billClosed: "Bill closed",
    renameTable: "Rename table",
    tableRenamed: "Table renamed",
    deleteTable: "Delete table",
    deleteTableConfirm: "The table will be deactivated and hidden from the panel. Continue?",
    tableDeleted: "Table deleted",
    settings: "Settings",
    charges: "Charge rates",
    currencyBlocked:
      "{n} active product(s) are priced in another currency. Deactivate or delete them to switch.",
    bankCol_reference: "Reference",
    bankCol_amount: "Credit amount",
    bankCol_date: "Date",
    bankCol_description: "Description",
    bankField_amount: "amount",
    bankField_bank: "bank",
    bankField_phone: "phone",
    bankField_id: "ID number",
    subBannerOverdue: "You have an overdue Splite subscription payment.",
    subBannerSuspended: "Your Splite subscription is suspended: new bills cannot be opened.",
    subBannerSee: "See subscription",
  },
} as const;

/*
 * Por partes.
 *
 * El diccionario entero -- los dos idiomas de la landing, el comensal, el
 * personal y la consola -- viajaba en el código que carga cada página: 120 KB
 * sin comprimir que un comensal descargaba antes de ver su cuenta, la mayoría
 * del panel. Ahora aquí sólo queda lo común (lo que usa el esqueleto de la app
 * y las claves que se arman con variables, como `role${…}`), y el resto vive
 * en `i18n-guest.ts`, `i18n-staff.ts`, `i18n-public.ts` e `i18n-errors.ts`.
 *
 * Cada archivo que usa una clave de una parte importa esa parte (`import
 * "@/lib/i18n-staff"`; en `routes/`, `useI18n(staffStrings)`), y al cargarse
 * se registra en `i18n-registry.ts`. Así el empaquetador la pone sólo en las
 * páginas que la usan, y cuando un componente pinta su primera palabra su
 * parte ya está. `unit/i18n-parts.test.ts` falla si alguien usa una clave sin
 * importar su parte, y `scripts/i18n-build-check.mjs` si una parte no llega a
 * la compilación (`package.json` las declara en `sideEffects` por eso).
 */

import { registry, type Strings } from "@/lib/i18n-registry";
export { defineStrings } from "@/lib/i18n-registry";

export type Key =
  | keyof (typeof dict)["es"]
  | keyof (typeof import("./i18n-guest"))["guestStrings"]["es"]
  | keyof (typeof import("./i18n-staff"))["staffStrings"]["es"]
  | keyof (typeof import("./i18n-public"))["publicStrings"]["es"]
  | keyof (typeof import("./i18n-errors"))["errorStrings"]["es"];

/** La palabra en este idioma; en español si faltara, y la clave si ni eso. */
function lookup(lang: Lang, key: string): string {
  const common = key as keyof (typeof dict)["es"];
  return dict[lang][common] ?? registry[lang][key] ?? dict.es[common] ?? registry.es[key] ?? key;
}

/**
 * Singular o plural, según el número.
 *
 * El panel escribía "1 cobro(s) hoy", "3 sección(es)", "2 sesión(es)
 * cerrada(s)". Ese paréntesis es lenguaje de formulario, no de producto, y en
 * inglés queda igual de mal. Las dos formas están en el diccionario, así que
 * cada idioma elige la suya.
 */
export type CountKey = "payment" | "bill" | "line" | "payStateClaims";

const Ctx = createContext<{
  lang: Lang;
  t: (k: Key) => string;
  plural: (n: number, k: CountKey) => string;
  setLang: (l: Lang) => void;
  /** Para quien no ha elegido idioma: el del teléfono, sin guardarlo. */
  adoptBrowserLang: () => void;
}>({
  lang: "es",
  t: (k) => lookup("es", k),
  plural: (n, k) => lookup("es", `${k}_${n === 1 ? "one" : "other"}`),
  setLang: () => {},
  adoptBrowserLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("es");
  useEffect(() => {
    const stored = storedLang();
    if (stored) setLang(stored);
  }, []);
  // El idioma del documento sigue al de la pantalla: un lector de pantalla lee
  // con la voz de `lang`, y con la página en inglés seguía leyendo en español.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const update = (l: Lang) => {
    setLang(l);
    try {
      window.localStorage.setItem("mesa-lang", l);
    } catch {
      /* se queda en este idioma hasta recargar; nada más */
    }
  };
  return (
    <Ctx.Provider
      value={{
        lang,
        setLang: update,
        // Sin guardar a propósito: es una suposición, no una elección. Quien
        // pulse ES o EN la convierte en elección y entonces sí se guarda.
        adoptBrowserLang: () => {
          if (!storedLang()) setLang(browserLang());
        },
        t: (k) => lookup(lang, k),
        plural: (n, k) => lookup(lang, `${k}_${n === 1 ? "one" : "other"}`),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * `parts`: en un archivo de `routes/`, la parte del diccionario que usa la
 * página (`useI18n(staffStrings)`) en vez de `import "@/lib/i18n-staff"`.
 *
 * El enrutador mete la cabecera de cada archivo de ruta -- y con ella sus
 * importaciones sueltas -- en el código de arranque de *todas* las páginas.
 * Una importación que el componente usa viaja con el componente, en el archivo
 * de su página. Medido: las tres partes, 43 KB comprimidos, se cargaban en
 * cada página.
 */
export const useI18n = (..._parts: { es: Strings }[]) => useContext(Ctx);
