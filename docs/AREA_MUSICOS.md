# Área de músicos JC

## Puesta en marcha

1. Cada persona inicia sesión con Google. Su perfil se crea como público general.
2. En **Admin → Usuarios**, asignar el rol **Músico**. No hay solicitud ni elección de rol en el registro.
3. En **Ficha musical**, completar nombre, instrumento y año de incorporación. El músico puede cambiar nombre e instrumento en **Mi perfil**; el año queda reservado a administración.
4. En **Admin → Músicos**, crear ensayo o actuación. Las horas se introducen en horario de Madrid. Los músicos y administradores actuales quedan convocados. Usar **Añadir nuevos músicos** para incorporar altas posteriores a la convocatoria.
5. El músico accede desde **Músicos** en la portada y responde **Voy / No voy** hasta el plazo. No responder se mantiene como estado independiente.
6. Para fichar, configurar el punto de llegada y radio (150 m por defecto), abrir el fichaje desde dos horas antes del evento y mostrar el QR. La apertura dura como máximo dos horas y nunca supera el fin previsto; puede reabrirse dentro del horario permitido.
7. Mantener una sola pantalla QR por evento. El código cambia cada 60 segundos. Escanear con la cámara del móvil, iniciar sesión y pulsar **Comprobar ubicación y fichar**. Si se inicia sesión y caduca el QR, volver a escanear.
8. Cerrar el fichaje al terminar. Revisar incidencias y músicos sin fichaje, y exportar el CSV si se necesita.

## Presencia y excepciones

- La confirmación no acredita presencia.
- El servidor valida usuario convocado, rol vigente, evento activo, ventana de fichaje, token y distancia.
- La precisión debe ser como máximo 100 m y no superar el radio configurado.
- Una ubicación distante o poco precisa crea una incidencia; no acredita presencia.
- Sin permiso de ubicación o sin batería, administración puede registrar manualmente, con motivo obligatorio.
- Solo se admite un registro de asistencia por persona y evento. Las revisiones conservan en auditoría el registro anterior, el motivo y el responsable.
- Un QR más la ubicación del navegador dificulta el fichaje remoto; no garantiza identidad física ni impide una ubicación manipulada. Acredita llegada, no permanencia o salida.

## Privacidad y permisos

No hay seguimiento continuo ni se guardan las coordenadas del móvil. Se conserva la hora del servidor, distancia aproximada, precisión y resultado. Las fichas musicales y convocatorias solo son accesibles para sus destinatarios y administración. El músico solo consulta sus respuestas y asistencias. Un rol retirado pierde acceso en la siguiente consulta sin esperar a renovar JWT. Las páginas privadas no se guardan en el service worker para uso sin conexión.

Las escrituras pasan por `public.banda_accion` (invocador) hacia un despachador en `jc_private` con controles explícitos. Las tablas tienen RLS y solo conceden lectura al cliente. Los tokens QR permanecen en un esquema no expuesto y no aparecen en listados de eventos.

## Validación

- `node --test tests/*.test.cjs`: comprobaciones existentes de repertorios y nuevas de fechas de Madrid y escape de texto.
- `tests/banda-permisos.sql`: prueba de integración con usuarios temporales, confirmación, QR, ubicación, corrección, privacidad y retirada de rol. Ejecutar como una única transacción en SQL Editor o MCP; termina con ROLLBACK y no deja registros.
- `tests/banda-browser.cjs`: recorrido de interfaz con datos simulados, confirmaciones, QR, ficha y ausencia de desbordamiento en móvil. Requiere Playwright y un servidor local en el puerto 8090. No sustituye las pruebas de permisos contra Supabase ni una prueba de GPS con móviles reales.
- Generador QR local: qrcode-generator 1.4.4 (MIT), conservado en `js/vendor/qrcode-generator.js`. No se transmite el enlace de fichaje a un servicio externo.

Los cambios de código se publican en GitHub; Netlify despliega automáticamente. `supabase_area_musicos.sql` documenta el estado completo instalado y se aplica solo una vez en una base sin este módulo.
