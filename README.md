# Splite — web app

The web app for [Splite](https://splite.lovable.app), pay-at-table for
Venezuelan restaurants. One app, three audiences:

- **Diners** scan the QR on their table. No download and no account. They see
  the bill live, split it, order from the menu, tip, pay by Pago Móvil, and
  follow their payment until staff confirm it.
- **Staff** use a panel: floor and tables, open bills, the orders tray, the
  payment confirmation queue, menu, QR codes, team and settings.
- **The Splite team** use an operator console under `/admin`: clients, plans,
  charges and sign-ups.

The API is [VartanKazarian/splite-backend](https://github.com/VartanKazarian/splite-backend).
Its contract (`openapi.json`) is the source of truth for every call this app
makes, and `src/lib/api.ts` is the only place that talks to it.

## Stack

TanStack Start (React 19, TanStack Router and Query, server rendering), Vite,
Tailwind and shadcn/ui, Bun for tests. Built and hosted with
[Lovable](https://lovable.dev/projects/b2c5c7ee-96f5-4253-b5fb-e4d39f958e9d):
pushes to `main` sync into Lovable, and **publishing in Lovable** is what puts a
change live. Merging alone does not.

## Where things are

| Path                                           | What                                                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`                                  | One file per page. `t.$.tsx` is the table a QR opens; `dashboard`, `mesas`, `pagos`, `menu`, `settings` are the staff panel; `admin.*` is the operator console; `index` and `tpv-hosteleria` are public pages |
| `src/components/`                              | Screens and pieces. `Guest*` is the diner's side, `panel/` the staff side                                                                                                                                     |
| `src/lib/api.ts`                               | Every API call and type, sessions, token refresh                                                                                                                                                              |
| `src/lib/i18n.tsx`                             | All copy, Spanish and English                                                                                                                                                                                 |
| `src/lib/security-headers.ts`, `src/server.ts` | Security headers and the per-request script policy                                                                                                                                                            |
| `unit/`                                        | Unit tests (`bun test`)                                                                                                                                                                                       |
| `tests/smoke/`                                 | End-to-end journeys against a real API (Playwright); see its [README](tests/smoke/README.md)                                                                                                                  |

## Running it

```sh
bun install          # or npm i
bun run dev          # http://localhost:5173
```

The API address comes from `VITE_API_BASE_URL` in `.env`. It points at the
production API, so a local dev server talks to real data. Run the backend
locally and point it there when you need something to break.

| Command                              | Does                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `bun run dev`                        | Dev server                                                                         |
| `bun run build`                      | Production build (Cloudflare target; `NITRO_PRESET=node-server` for a Node server) |
| `bun run test`                       | Unit tests                                                                         |
| `bun run test:smoke`                 | End-to-end journeys (needs a running API)                                          |
| `bun run typecheck` / `bun run lint` | Types / ESLint                                                                     |

CI runs typecheck, lint, unit tests and the smoke journeys against the
backend's `main` on every pull request.

## Security notes

- **Script policy.** Every page response carries a fresh nonce, and only
  scripts with it, or files from the site itself, run. Injected scripts and
  inline handlers are blocked. Lovable's own analytics script is same-origin
  and allowed. See `src/lib/security-headers.ts`.
- **Staff login.** Access tokens last 15 minutes. The refresh token lasts
  12 hours idle and 16 hours at most. On `splite.lat`, with the API on
  `api.splite.lat`, it lives in an HttpOnly cookie that page scripts cannot
  read. On any other host it falls back to browser storage. See
  `refreshViaCookie` in `src/lib/api.ts`.
- **Diners.** The guest session is bound to one bill and kept in
  `sessionStorage`, so it dies with the tab.

## Domain

The site is served at `https://splite.lat` (`www` and `splite.lovable.app`
redirect there, path and query included, so QR codes printed with the old
address keep working). The API is at `https://api.splite.lat`; its Railway
address still works. Both are set in `.env`: `VITE_API_BASE_URL` for the API
and `VITE_GUEST_BASE_URL` for the links new QR codes carry. DNS is in
Cloudflare, with every web record set to **DNS only**, so Lovable and Railway
can issue their certificates.
