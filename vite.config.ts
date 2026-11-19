// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Sólo en el navegador: el servidor se compila en un único archivo y no
    // hay que tocarlo.
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  {
                    // Cada parte del diccionario en su propio archivo (ver
                    // lib/i18n.tsx): si no, la compilación las junta en el paquete
                    // común y todas las páginas descargan las tres.
                    name: (id: string) => {
                      const part = /src\/lib\/i18n-(guest|staff|public)\.ts$/.exec(id)?.[1];
                      return part ? `i18n-${part}` : null;
                    },
                    // Sólo la parte: lo que importa (el registro) se queda donde
                    // estaba. Con el valor por defecto se lo llevaba consigo, y con
                    // él la aplicación entera iba a parar al archivo del comensal.
                    includeDependenciesRecursively: false,
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
