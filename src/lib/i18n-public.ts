import { defineStrings } from "@/lib/i18n-registry";

/**
 * Las páginas públicas: alta, entrada, contraseña y páginas de venta.
 *
 * Una parte del diccionario (ver `lib/i18n.tsx`, «Por partes»). La importa
 * cada archivo que usa alguna de estas claves, así que viaja sólo en las
 * páginas que la necesitan. `unit/i18n-parts.test.ts` comprueba que nadie usa
 * una clave sin importar su parte.
 */
export const publicStrings = defineStrings({
  es: {
    login: "Iniciar sesión",
    loginSub: "Acceso al panel del restaurante",
    enter: "Entrar",
    authBadCredentials: "Correo o contraseña incorrectos.",
    forgotLink: "¿Olvidaste tu contraseña?",
    authBadEmail: "Revisa el correo: no parece una dirección válida.",
    forgotTitle: "Restablecer contraseña",
    forgotSub:
      "Escribe el correo con el que entras al panel y te mandamos un enlace para elegir una nueva.",
    forgotSend: "Enviar enlace",
    forgotSentTitle: "Revisa tu correo",
    forgotSentBody:
      "Si {email} tiene cuenta en Splite, te llegará un enlace en unos minutos. Caduca en 30 minutos y sirve una sola vez. Mira también en spam.",
    forgotBack: "Volver a entrar",
    resetTitle: "Elige una contraseña nueva",
    resetSub: "Al guardarla se cierran todas las sesiones abiertas de tu cuenta.",
    resetNew: "Contraseña nueva",
    resetRepeat: "Repítela",
    resetHint: "Al menos 12 caracteres.",
    resetMismatch: "Las dos contraseñas no coinciden.",
    resetSave: "Guardar contraseña",
    resetDoneTitle: "Contraseña cambiada",
    resetDoneBody: "Ya puedes entrar con tu contraseña nueva.",
    resetInvalid:
      "Este enlace ya no sirve: caducó, ya se usó o pediste otro después. Pide uno nuevo.",
    resetNoToken:
      "Abre el enlace completo que te llegó por correo. Si no lo tienes, pide uno nuevo.",
    resetAskAgain: "Pedir otro enlace",
    authBadCode: "Ese código no vale. Puede haber caducado: prueba con el siguiente.",
    authGeneric: "No hemos podido entrar. Vuelve a intentarlo.",
  },
  en: {
    login: "Sign in",
    loginSub: "Restaurant dashboard access",
    enter: "Enter",
    authBadCredentials: "Wrong email or password.",
    forgotLink: "Forgot your password?",
    authBadEmail: "Check the email: it doesn't look like a valid address.",
    forgotTitle: "Reset your password",
    forgotSub:
      "Enter the email you use for the dashboard and we'll send you a link to choose a new one.",
    forgotSend: "Send link",
    forgotSentTitle: "Check your email",
    forgotSentBody:
      "If {email} has a Splite account, a link will arrive in a few minutes. It expires in 30 minutes and works once. Check spam too.",
    forgotBack: "Back to sign in",
    resetTitle: "Choose a new password",
    resetSub: "Saving it signs out every open session on your account.",
    resetNew: "New password",
    resetRepeat: "Repeat it",
    resetHint: "At least 12 characters.",
    resetMismatch: "The two passwords don't match.",
    resetSave: "Save password",
    resetDoneTitle: "Password changed",
    resetDoneBody: "You can now sign in with your new password.",
    resetInvalid:
      "This link no longer works: it expired, was already used, or you asked for another one. Ask for a new one.",
    resetNoToken: "Open the full link from the email. If you don't have it, ask for a new one.",
    resetAskAgain: "Ask for another link",
    authBadCode: "That code is not valid. It may have expired: try the next one.",
    authGeneric: "We could not sign you in. Please try again.",
  },
});
