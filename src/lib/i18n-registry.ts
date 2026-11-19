/**
 * Dónde se registran las partes del diccionario (ver `lib/i18n.tsx`).
 *
 * Aparte y **sin importar nada** a propósito. Las partes importan esto, y la
 * compilación mete lo que importa una parte dentro del archivo de esa parte.
 * Cuando registraban en `i18n.tsx`, se llevaban a `i18n.tsx` -- y con él media
 * aplicación -- al archivo de la primera parte, y todas las páginas cargaban
 * el diccionario del comensal para llegar a él.
 */

export type Strings = Record<string, string>;

/** Las partes que ya cargaron, por idioma. Lo común está en `i18n.tsx`. */
export const registry: { es: Strings; en: Strings } = { es: {}, en: {} };

/**
 * Declara una parte del diccionario y la registra.
 *
 * El tipo obliga a que el inglés tenga exactamente las claves del español: una
 * que falte o sobre no compila, igual que con el diccionario único.
 */
export function defineStrings<T extends Strings>(part: { es: T; en: { [K in keyof T]: string } }) {
  Object.assign(registry.es, part.es);
  Object.assign(registry.en, part.en);
  return part;
}
