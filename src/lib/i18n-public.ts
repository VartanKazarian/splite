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
    mfaLoginTitle: "Código de verificación",
    mfaLoginBody:
      "Abre tu app de autenticación y escribe el código de seis dígitos. También sirve uno de tus códigos de recuperación.",
    mfaLoginCode: "Código",
    mfaLoginBack: "Volver",
    verifyMissingTitle: "Falta el enlace",
    verifyMissingBody:
      "Esta página se abre desde el enlace que te enviamos por correo. Ábrelo desde ahí — copiarlo a mano suele cortar el final.",
    verifyMissingHelp:
      "Si no encuentras el correo, escríbenos respondiendo al que recibiste cuando enviaste la solicitud y te mandamos otro.",
    verifyBackHome: "Volver al inicio",
    verifyTitle: "Activa tu cuenta",
    verifySub: "Elige una contraseña y entras directo al panel.",
    verifyPasswordShort: "Faltan {n} caracteres.",
    verifyPasswordMin: "Mínimo {min} caracteres.",
    verifyConfirm: "Repite la contraseña",
    verifyMismatch: "Las dos contraseñas no coinciden.",
    verifyReference: "Referencia",
    verifySubmitting: "Activando…",
    verifySubmit: "Activar cuenta",
    verifyErrNetwork: "No pudimos contactar con el servidor. Intenta de nuevo.",
    verifyErrTokenInvalid:
      "Este enlace ya no sirve: caduca a las pocas horas y solo se puede usar una vez. Si ya activaste la cuenta, entra con tu contraseña. Si no, escríbenos y te mandamos otro.",
    verifyErrPassword: "La contraseña no cumple el mínimo de {min} caracteres.",
    verifyErrRateLimited: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    verifyErrUnavailable:
      "No podemos procesar la activación ahora mismo. Intenta de nuevo en unos minutos.",
    verifyErrNotConfigured:
      "El registro no está habilitado en este momento. Escríbenos y lo resolvemos.",
    verifyErrExists:
      "Ya existe una cuenta con estos datos. Entra con tu contraseña, o escríbenos si no la reconoces.",
    verifyErrGeneric: "Algo salió mal de nuestro lado. Intenta de nuevo.",
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
    mfaLoginTitle: "Verification code",
    mfaLoginBody:
      "Open your authenticator app and enter the six-digit code. One of your recovery codes works too.",
    mfaLoginCode: "Code",
    mfaLoginBack: "Back",
    verifyMissingTitle: "The link is missing",
    verifyMissingBody:
      "This page opens from the link we emailed you. Open it from there — copying it by hand often cuts off the end.",
    verifyMissingHelp:
      "If you can't find the email, reply to the one you got when you sent your request and we'll send you another.",
    verifyBackHome: "Back to home",
    verifyTitle: "Activate your account",
    verifySub: "Choose a password and go straight to your dashboard.",
    verifyPasswordShort: "{n} more characters needed.",
    verifyPasswordMin: "At least {min} characters.",
    verifyConfirm: "Repeat the password",
    verifyMismatch: "The two passwords don't match.",
    verifyReference: "Reference",
    verifySubmitting: "Activating…",
    verifySubmit: "Activate account",
    verifyErrNetwork: "We couldn't reach the server. Please try again.",
    verifyErrTokenInvalid:
      "This link no longer works: it expires after a few hours and can only be used once. If you already activated your account, sign in with your password. If not, write to us and we'll send you another.",
    verifyErrPassword: "The password needs at least {min} characters.",
    verifyErrRateLimited: "Too many attempts. Wait a few minutes and try again.",
    verifyErrUnavailable:
      "We can't process the activation right now. Please try again in a few minutes.",
    verifyErrNotConfigured: "Sign-up isn't enabled right now. Write to us and we'll sort it out.",
    verifyErrExists:
      "An account with these details already exists. Sign in with your password, or write to us if you don't recognise it.",
    verifyErrGeneric: "Something went wrong on our side. Please try again.",
  },
});
