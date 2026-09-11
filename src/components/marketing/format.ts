import { useEffect, useState } from "react";

/**
 * Lo que no es un componente, fuera del fichero de componentes.
 *
 * Vivían en `Mockups.tsx` y el linter lo cantaba: un módulo que mezcla
 * componentes con otras cosas rompe el refresco en caliente durante el
 * desarrollo. No es una preferencia de estilo, es que al tocar el fichero se
 * recarga la página entera en vez del componente.
 */

/**
 * La tasa con la que se enseñan los ejemplos.
 *
 * Fija y rotulada como ejemplo a propósito: la landing es pública y no habla
 * con la API, así que una cifra que pareciera de hoy y no lo fuera sería una
 * mentira pequeña sobre justo el dato que el producto promete llevar al día.
 */
export const DEMO_RATE = 757.54;

/** Cuántos bancos admiten C2P hoy. Sale de `c2pClaveGuide.js`: son 22 entradas. */
export const C2P_BANKS = 22;

/** Bs con separadores venezolanos: miles con punto, decimales con coma. */
export function bs(usd: number): string {
  return `${(usd * DEMO_RATE).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Bs`;
}

export function usdText(usd: number): string {
  return `$${usd.toFixed(2).replace(".", ",")}`;
}

/** Un importe en la moneda elegida, para los mockups con interruptor. */
export function money(usd: number, currency: "USD" | "VES"): string {
  return currency === "USD" ? usdText(usd) : bs(usd);
}

/**
 * Si esta persona pidió que nada se mueva.
 *
 * Lo que se anima aquí no es decoración -- es el producto haciendo su trabajo,
 * y por eso nada se «apaga» sin más: cada animación tiene que enseñar su estado
 * final de inmediato. Un reparto que no se reparte no es un reparto quieto, es
 * una cuenta en blanco.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    // En un efecto: esto también se pinta en el servidor, donde no hay
    // `matchMedia`, y leerlo en el render daría dos marcados distintos.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
