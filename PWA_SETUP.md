# Activación de PWA y avisos de directo

La parte pública, el service worker y las funciones de Netlify ya están implementados.
Para activar los avisos en producción faltan estos pasos de infraestructura:

## 1. Crear la tabla en Supabase

Ejecutar en el editor SQL:

`supabase_push_subscriptions.sql`

La tabla no tiene políticas públicas. Solo las funciones de Netlify acceden mediante la `service_role`.

## 2. Configurar variables en Netlify

En **Site configuration → Environment variables**, añadir:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_ANON_KEY`: clave pública `anon`.
- `SUPABASE_SERVICE_ROLE_KEY`: preferiblemente una clave moderna `sb_secret_...`;
  también es compatible con la antigua `service_role`.
- `VAPID_PUBLIC_KEY`: valor de `.env.local`.
- `VAPID_PRIVATE_KEY`: valor de `.env.local`.
- `VAPID_SUBJECT`: `mailto:admin@bandajuliancerdan.com` o un correo válido de contacto.

La clave privada VAPID y la `service_role` nunca deben incluirse en archivos públicos.

## 3. Desplegar de nuevo en Netlify

Netlify instalará la dependencia `web-push` declarada en `package.json` y publicará:

- `push-subscribe`
- `push-unsubscribe`
- `push-live`

## 4. Prueba recomendada

1. Abrir la web publicada desde un móvil.
2. Pulsar **Avisarme del directo** y aceptar el permiso.
3. Cerrar la web.
4. Entrar en Administración y activar una nueva actuación.
5. El móvil debe recibir el aviso y abrir directamente la pantalla del directo.

En iPhone, las notificaciones web requieren instalar primero la web en la pantalla de inicio.
