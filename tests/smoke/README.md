# Pruebas de humo

Seis recorridos con Playwright sobre lo que da dinero. Afirman que **se puede
llegar hasta el final**, no cómo se ve nada: una prueba que fija píxeles o
textos se rompe con cada retoque y acaba borrándose, y a este producto le queda
rediseño por delante.

| #   | Recorrido                                                           |
| --- | ------------------------------------------------------------------- |
| 1   | QR → mesa → cuenta → pagar toda la cuenta → declarar → confirmación |
| 2   | QR → dividir → elegir productos → pagar mi parte                    |
| 3   | QR → dividir entre todos → acordar → tomar una parte y nombrarla    |
| 4   | Personal: entrar → panel → mesas → cuenta abierta                   |
| 5   | Personal: confirmar un pago declarado y ver la cuenta cerrarse      |
| 6   | Ajustes: RIF y serie fiscal                                         |

## Correrlas

Hacen falta la API y esta web levantadas. La API necesita su PostgreSQL, su
Redis y sus migraciones; eso no lo levanta Playwright.

```bash
# en splite-backend, con DATABASE_URL y REDIS_URL puestos
npm run migrate
SEED_OWNER_EMAIL=owner@example.com SEED_OWNER_PASSWORD='…' npm run seed
PORT=4010 npm start

# aquí
SMOKE_API_URL=http://127.0.0.1:4010 bun run test:smoke
```

Playwright levanta el servidor de desarrollo si no hay ninguno escuchando, y
reutiliza el que haya.

| Variable                         | Para qué                          | Por defecto             |
| -------------------------------- | --------------------------------- | ----------------------- |
| `SMOKE_WEB_URL`                  | Dónde está esta web               | `http://127.0.0.1:5173` |
| `SMOKE_API_URL`                  | Dónde está la API                 | `http://127.0.0.1:4010` |
| `SMOKE_EMAIL` / `SMOKE_PASSWORD` | El dueño con el que se monta todo | `owner@example.com`     |
| `SMOKE_ALLOW_REMOTE`             | Permitir una API que no sea local | sin poner               |
| `PLAYWRIGHT_CHROMIUM_PATH`       | Un Chromium ya instalado          | el de Playwright        |

## Dos cosas que conviene saber antes de que sorprendan

**Escriben.** Crean mesas, productos, cuentas y avisos de pago, y la sexta
escribe el RIF y la serie fiscal. Contra una base de desarrollo eso es gratis;
contra la de un local con clientes no lo es -- el RIF se congela con la primera
factura y la serie es la transcripción de una autorización del SENIAT. Por eso
la suite se niega a correr contra algo que no sea `localhost` salvo que se lo
pidas por escrito con `SMOKE_ALLOW_REMOTE=1`.

**Dos ejecuciones seguidas se cortan.** `/api/v1/auth` admite diez llamadas por
minuto y por dirección y una ejecución gasta siete. Si las lanzas dos veces en
el mismo minuto, la segunda falla con un mensaje que lo dice. Espera un minuto.

## Por qué hay `data-testid`

Porque el texto de los botones va a cambiar y el recorrido no. Los anclajes
están sólo en los controles que deciden si se cobra -- abrir la cuenta, elegir
cómo dividir, marcar lo consumido, declarar el pago, confirmarlo -- y no en
nada decorativo. Todo lo demás se busca por su papel o por su etiqueta
accesible, que es como lo busca quien usa un lector de pantalla.
