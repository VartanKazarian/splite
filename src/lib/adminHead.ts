/** Para las rutas de la consola: que ningún buscador las indexe. */
export const adminHead = (title: string) => () => ({
  meta: [{ title: `${title} — Consola Splite` }, { name: "robots", content: "noindex, nofollow" }],
});
