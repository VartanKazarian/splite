import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { cspNonce } from "./lib/csp-nonce";

export const getRouter = () => {
  const queryClient = new QueryClient();

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
