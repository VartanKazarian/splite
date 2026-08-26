# Plan: cerrar hallazgos SEO pendientes

## 1. Marcar como resueltos los hallazgos ya corregidos
- Etiquetas de formulario del login (ya añadidas `htmlFor`/`id`).
- Marca inconsistente "Mesa" vs "Splite" (ya reemplazada por "Splite" en todos los metadatos).
- Marcar vía la herramienta de hallazgos SEO para que el próximo escaneo reverifique.

## 2. Conexión con Google Search Console
- Conectar la cuenta de Google Search Console al proyecto (tarjeta de conexión).
- Solicitar el token de verificación META e insertar la etiqueta exacta en el `<head>` de la raíz (`src/routes/__root.tsx`).
- Crear `public/sitemap.xml` con las rutas públicas de `https://splite.lovable.app` (`/`, `/registro`, `/login`, y `/tpv-hosteleria` si se aprueba la sección 3) y añadir la línea `Sitemap:` en `public/robots.txt` — ambos cambios van en el mismo despliegue para publicar una sola vez.
- Solicitar la publicación del sitio, confirmar que la etiqueta y el sitemap están en vivo, verificar la propiedad, añadirla a Search Console y enviar el sitemap.
- Marcar el hallazgo de Search Console como resuelto al completar.

## 3. Página /tpv-hosteleria (oportunidad de keyword)
- Crear `src/routes/tpv-hosteleria.tsx`: página de aterrizaje en español orientada al término "tpv hostelería", con la estética Ivory & Emerald existente.
- Contenido: H1 con "TPV para hostelería", cómo Splite complementa/reemplaza el TPV tradicional (QR por mesa, división de cuenta, pago desde el móvil), beneficios y CTA a `/registro`.
- Metadatos propios con `head()` (título, descripción, og, canonical) siguiendo el patrón del proyecto.
- Enlazarla desde el pie de la landing y marcar la oportunidad como abordada.

## Notas técnicas
- Sitemap: XML estático en `public/sitemap.xml`; solo URLs del dominio publicado `splite.lovable.app`.
- Verificación: etiqueta `<meta name="google-site-verification" ...>` exacta devuelta por Google, en `__root.tsx`.
- La publicación del sitio requerirá tu aprobación (tarjeta de publicación) antes de verificar.
