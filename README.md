# Table Splitter

A web app frontend for this app on backend



The users will need to login to see their business frontend



Una web para un negocio de dividir cuentas de restaurantes que ofrezca 

1. Código QR único por mesa

    * Cada mesa tiene un QR permanente.

    * El QR identifica el restaurante y la mesa.

2. Aplicación web (PWA)

    * El cliente escanea el QR.

    * Se abre una aplicación web, sin descargar nada.

    * Allí puede ver la cuenta, dividirla, dejar propina y pagar. 

3. Integración con el POS

    * El sistema consulta el POS del restaurante.

    * Obtiene la cuenta abierta de esa mesa.

    * Cuando el cliente paga, el POS recibe la notificación y cierra parcial o totalmente la cuenta automáticamente. 

4. Pasarela de pagos

    * Stripe, Adyen, Worldpay u otra.

    * Apple Pay

    * Google Pay

    * Tarjetas

5. Backend

    * Maneja sesiones.

    * Divide cuentas.

    * Calcula propinas.

    * Actualiza el POS.

    * Envía recibos.

⸻

Arquitectura técnica

Podría verse así:

Cliente

QR Mesa 15

↓

Aplicación Web

↓

Backend

↓

API del Restaurante

↓

POS

↓

Factura Abierta

↓

Pasarela de Pago

↓

Pago aprobado

↓

Cerrar factura en POS

⸻

¿Qué hace realmente el algoritmo de dividir cuentas?

Es más sencillo de lo que parece.

El backend recibe algo como:

Mesa 15

Hamburguesa 15$

Pizza 18$

Refresco 4$

Cerveza 5$

Luego el usuario puede elegir:

* pagar productos específicos

* dividir entre personas

* dividir en porcentajes

* pagar monto personalizado

Después el sistema genera múltiples pagos parciales.

Ejemplo:

Persona A

Hamburguesa

Refresco

Total = 19$

Persona B

Pizza

Cerveza

Total = 23$

Cuando ambos pagan, el POS marca esos ítems como pagados.

⸻

Lo realmente difícil

Aquí está el verdadero negocio.

No es la aplicación.

Es conectarse con todos los POS.

Sunday tiene integraciones con numerosos sistemas POS del mercado. 

⸻

En Venezuela

Habría que identificar cuáles son los POS para restaurantes más usados.

Ejemplos hipotéticos:

* Soft Restaurant

* A2

* Valery

* Profit

* sistemas propios

Cada uno puede tener:

* API REST

* Base de datos SQL

* WebService

* SDK

* ninguna integración

Si no tienen API, habría que desarrollar un conector.

⸻

¿Qué es un conector?

Es un pequeño programa instalado en el restaurante.

Ejemplo:

POS

↓

Conector Local

↓

Internet

↓

Tu nube

El conector:

* lee la cuenta abierta

* envía la información

* recibe pagos

* actualiza la factura

Este modelo evita modificar el POS directamente.

⸻

Tecnologías recomendadas

Backend

* Node.js (NestJS)

* Go

* Java Spring Boot

Base de datos

* PostgreSQL

Cache

* Redis

Frontend

* React

* Next.js

* PWA

Aplicación para meseros (opcional)

* Flutter

Infraestructura

* Docker

* Kubernetes (si escalas)

* AWS

* Azure

* DigitalOcean

⸻

Pagos en Venezuela

Necesitarías integrar:

* Pago Móvil

* Bancamiga

* Banesco

* Mercantil

* Cashea (si aplica)

* Stripe (para tarjetas internacionales)

* Wally

* otras pasarelas nacionales disponibles

⸻

Modelo de negocio

Hay varias opciones:

* Suscripción mensual por restaurante.

* Comisión por transacción.

* Alquiler o venta de kits QR/NFC.

* Analítica de clientes y panel administrativo como servicio adicional.

⸻

¿Es una buena oportunidad?

Sí, especialmente porque el mercado venezolano todavía tiene poca oferta de soluciones modernas de “Pay at Table”.

Sin embargo, yo no intentaría competir con Sunday desde el primer día.

Empezaría con un MVP:

* QR por mesa.

* Ver la cuenta en tiempo real.

* Dividir la cuenta.

* Pago por Pago Móvil o tarjeta.

* Integración con un solo POS (el más usado en Venezuela).

* Panel para el restaurante.

Una vez que ese flujo funcione, desarrollaría conectores para otros POS. Ese conjunto de integraciones es lo que crea una ventaja competitiva y hace más difícil que otros copien el producto.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://splite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b2c5c7ee-96f5-4253-b5fb-e4d39f958e9d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
