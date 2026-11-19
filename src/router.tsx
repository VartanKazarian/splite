import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./lib/api";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { cspNonce } from "./lib/csp-nonce";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Una respuesta 4xx no cambia por repetirla: un 403 de rol, un 404 de
        // un pago de otra mesa. Sólo se reintenta lo que puede ser la red o un
        // 5xx pasajero, y una vez. Antes eran tres reintentos de todo, con lo
        // que una pantalla sin permiso tardaba segundos en decirlo.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 1;
        },
      },
    },
  });

  const nonce = cspNonce();
  const router = createRouter({
    routeTree,
    // El router pone este nonce en los scripts que escribe en la página; la
    // política de src/lib/security-headers.ts sólo deja correr esos.
    ...(nonce ? { ssr: { nonce } } : {}),
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
