# Auditoría práctica — 22 de octubre de 2026

Alcance: permisos de base de datos, directo, caché/PWA, notificaciones, referencias a recursos, sintaxis y pruebas de los flujos del portal. No equivale a una auditoría exhaustiva ni a una prueba en cada modelo de teléfono.

## Correcciones

| Hallazgo comprobado | Corrección |
| --- | --- |
| Reglas antiguas permitían editar el directo públicamente e insertar con cualquier cuenta | Retiradas; quedan las reglas de administrador |
| Los perfiles con email y otros datos personales eran públicos | Lectura limitada al propio usuario y administración |
| Reglas antiguas de chat/comentarios permitían enviar con otro usuario_id | Retiradas; se aplica la comprobación de propiedad |
| La función de contador de comentarios no fijaba search_path | Ruta vacía y tabla cualificada |
| Notificaciones del portal devolvían 502 por web-push ausente | Inclusión explícita de dependencias; producción devuelve 403 JSON sin sesión, como corresponde |
| El chat borraba el texto antes de confirmar el envío | Conserva el texto ante error y bloquea envíos simultáneos |
| Una nueva marcha podía no estar en el catálogo cargado por el espectador | Refresco de catálogo si aparece un ID desconocido y presentación de autor |
| localStorage bloqueado podía interrumpir la visualización del directo | Guardado de caché opcional, sin bloquear el contenido |
| El service worker podía almacenar respuestas de funciones ligadas a sesión | Funciones excluidas expresamente de la caché |

## Verificación

- 19 pruebas de Node; 28 archivos JavaScript con sintaxis válida.
- Pruebas de navegador: portal, calendario y administración, incluidos anchos de 320, 390 y 1280 píxeles.
- Comprobación de permisos en Supabase con roles anon/authenticated/admin y rollback.
- Sin recursos locales ausentes en etiquetas script/link/img de las 16 páginas HTML analizadas.
- Portada, catálogo, comunidad, directo, portal, administración y acceso responden 200. Código fuente de funciones devuelve 404.
- Endpoint de suscripción de avisos comprobado en producción; no se enviaron notificaciones reales para probarlo. Entrega en un móvil físico pendiente de prueba con consentimiento del receptor.

## Próximas prioridades

1. Ejecutar pruebas automáticamente antes de publicar y disponer de un entorno de pruebas separado.
2. Revisar las copias de seguridad disponibles y ensayar su restauración.
3. Unificar las capas de administración del directo y asignar el orden de nuevas entradas en una transacción del servidor: el cálculo actual máximo+1 puede competir si dos administradores escriben a la vez.
4. Añadir registro de errores y alertas de fallos de funciones sin almacenar motivos privados ni tokens.
5. Activar protección contra contraseñas filtradas si el plan de Supabase lo permite. [Referencia de Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Las advertencias sobre enlaces públicos compartidos y funciones de comprobación de permisos requieren valorar su función; no se retiraron capacidades necesarias para compartir repertorios.
