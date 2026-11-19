/**
 * La página de último recurso, cuando el servidor no pudo pintar ni la de error.
 *
 * En español, como el resto de Splite (estaba en inglés), con una línea en
 * inglés debajo. «Probar otra vez» es un enlace a la misma dirección y no un
 * botón con `onclick`: la política de seguridad no deja correr manejadores en
 * línea, así que ese botón no hacía nada.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Esta página no cargó — Splite</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fdfaf4; color: #1c1917; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      main { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #57534e; margin: 0 0 1.5rem; }
      .en { font-size: 0.8rem; margin-top: -1rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a { min-height: 44px; display: inline-flex; align-items: center; padding: 0 1.25rem; border-radius: 999px; font: inherit; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #1f7e59; color: #fff; }
      .secondary { background: #fff; color: #1c1917; border-color: #d6d3d1; }
    </style>
  </head>
  <body>
    <main>
      <h1>Esta página no cargó</h1>
      <p>Algo falló de nuestro lado. Prueba otra vez; si estabas pagando, tu pago no se ha perdido.</p>
      <p class="en" lang="en">This page didn't load. Please try again.</p>
      <div class="actions">
        <a class="primary" href="">Probar otra vez</a>
        <a class="secondary" href="/">Ir al inicio</a>
      </div>
    </main>
  </body>
</html>`;
}
