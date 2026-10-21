# Área de músicos JC

## Puesta en marcha

1. Cada persona inicia sesión con Google. Su perfil se crea como público general.
2. En **Admin → Usuarios**, marcar el permiso **Músico**. **Administrador** es un permiso independiente: se pueden marcar ambos. No hay solicitud ni elección de rol en el registro.
3. En **Ficha musical**, completar nombre, instrumento y año de incorporación. El músico puede cambiar nombre e instrumento en **Mi ficha musical**, dentro del portal; el año queda reservado a administración.
4. En **Admin → Músicos**, seleccionar un día del calendario y colocar **Ensayo tarde** (20:30–22:00) o **Ensayo mañana** (12:00–14:00), en el local de la banda. Programar las actuaciones desde su publicación de concierto o procesión. Las horas se introducen en horario de Madrid. Solo las cuentas con permiso Músico quedan convocadas, incluidas las que también son administradoras. Usar **Añadir nuevos músicos** para incorporar altas posteriores a la convocatoria.
5. El músico accede desde la pestaña **Portal músico** de la navegación principal y responde **Voy / No voy** en las actuaciones hasta el plazo. Los ensayos no requieren respuesta previa ni cuentan como pendientes. No responder se mantiene como estado independiente.
6. Para fichar, abrir el fichaje desde dos horas antes del evento y mostrar el QR. La apertura dura como máximo dos horas y nunca supera el fin previsto; puede reabrirse dentro del horario permitido.
7. Mantener una sola pantalla QR por evento. El código cambia cada 60 segundos. Escanear con la cámara del móvil, iniciar sesión y pulsar **Confirmar mi asistencia**. Si se inicia sesión y caduca el QR, volver a escanear.
8. Cerrar el fichaje al terminar. Revisar incidencias y músicos sin fichaje, y exportar el CSV si se necesita.

## Pantallas del portal

- **Resumen:** próxima convocatoria, respuestas pendientes, presencias e incidencias y acceso a la ficha musical.
- **Calendario:** navegar meses y consultar eventos por día; ensayos y actuaciones se distinguen por sus indicadores.
- **Confirmaciones:** responder Voy / No voy en actuaciones; los ensayos muestran solamente la información y el acceso al fichaje; buscar por título o lugar y filtrar por pendientes, ensayos o actuaciones.
- **Mis asistencias:** historial individual con el resultado y los motivos de revisión.
- **Escanear QR:** abrir cámara tras pulsar el botón, leer una imagen de la galería o pegar el enlace. Las imágenes se procesan localmente y solo se aceptan enlaces de asistencia de esta misma web. Leer el código prepara el fichaje; pulsar Confirmar mi asistencia envía el registro sin pedir ubicación.

La cámara trasera se solicita sin micrófono y se cierra al reconocer un QR, cambiar de vista, ocultar la página o salir de ella. Los mensajes ofrecen alternativas si se deniega el permiso. La política del servidor permite la cámara únicamente en la ruta del portal. Una conexión HTTPS y los permisos del navegador son necesarios para el escaneo en vivo. Se sigue pudiendo escanear desde la cámara nativa del móvil.

## Presencia y excepciones

- La confirmación no acredita presencia.
- El servidor valida usuario convocado, rol vigente, evento activo, ventana de fichaje, y token vigente.
- Sin cámara o sin batería, administración puede registrar manualmente, con motivo obligatorio.
- Solo se admite un registro de asistencia por persona y evento. Las revisiones conservan en auditoría el registro anterior, el motivo y el responsable.
- La junta custodia y muestra el QR. Solo administración puede generarlo y abrir el fichaje; el músico convocado lo escanea y confirma su llegada.

## Privacidad y permisos

No se solicita ubicación ni se guardan coordenadas, distancia o precisión en los nuevos fichajes. Se conserva la hora del servidor y el resultado. Los campos y registros antiguos se conservan para no alterar el historial. Las fichas musicales y convocatorias solo son accesibles para sus destinatarios y administración. El músico solo consulta sus respuestas y asistencias. Un rol retirado pierde acceso en la siguiente consulta sin esperar a renovar JWT. Las páginas privadas no se guardan en el service worker para uso sin conexión.

Las escrituras básicas pasan por `public.banda_accion` y las ampliaciones por `public.banda_portal_accion` (ambos invocadores), hacia despachadores en `jc_private` con controles explícitos. Las tablas tienen RLS y solo conceden lectura al cliente. Los tokens QR permanecen en un esquema no expuesto y no aparecen en listados de eventos.

## Validación

- `node --test tests/*.test.cjs`: comprobaciones existentes de repertorios y nuevas de fechas de Madrid y escape de texto.
- `tests/banda-permisos.sql`: prueba de integración con usuarios temporales, confirmación, QR sin GPS, corrección, privacidad y retirada de rol. Ejecutar como una única transacción en SQL Editor o MCP; termina con ROLLBACK y no deja registros.
- `tests/banda-browser.cjs`: recorrido de interfaz con datos simulados, confirmaciones, QR, ficha y ausencia de desbordamiento en móvil. Requiere Playwright y un servidor local en el puerto 8090. No sustituye las pruebas de permisos contra Supabase ni la comprobación de cámara en móviles reales.
- `tests/banda-scanner.test.cjs`: validación de origen, ruta y formato de los QR.
- `tests/banda-scanner-browser.cjs`: recorre cinco vistas a 320–1280 px; prueba cámara denegada, QR reales por vídeo e imagen y cierre de cámara sin dispositivos físicos.
- Lector QR: jsQR 1.4.0 (Apache-2.0), conservado localmente con su licencia, sin servicios externos de lectura.
- Generador QR local: qrcode-generator 1.4.4 (MIT), conservado en `js/vendor/qrcode-generator.js`. No se transmite el enlace de fichaje a un servicio externo.

Los cambios de código se publican en GitHub; Netlify despliega automáticamente. `supabase_permisos_musico_admin.sql` actualiza instalaciones anteriores para separar ambos permisos. `supabase_area_musicos.sql` documenta el estado completo instalado y se aplica solo una vez en una base sin este módulo.

## Publicaciones y calendario compartido

Aplicar `supabase_calendario_actuaciones.sql` una vez después de la instalación del área y la separación de permisos. Añade las plantillas, los ajustes privados del local y la sincronización con publicaciones. No crea eventos reales. También sustituye dos políticas antiguas de escritura abierta de procesiones: publicar o editar requiere administración.

- Conciertos: preparar en Borrador, completar fecha, inicio, fin y lugar; Publicado genera una sola convocatoria. Los borradores y las publicaciones ocultas no convocan.
- Procesiones: **Programar procesión** crea una publicación Programada y su convocatoria. En Directo, seleccionar la ya programada para activarla conservando identidad y respuestas. El flujo de directo inmediato sigue disponible.
- La portada muestra próximas publicaciones de ambos tipos; el archivo conserva actuaciones finalizadas y conciertos anteriores. Los ensayos y la información interna no se consultan en la portada.
- Los disparadores sincronizan título, fecha, horario y lugar de forma atómica. Un fin anterior al inicio se interpreta como el día siguiente. Cambiar horario o lugar cierra el fichaje y revoca el QR vigente.
- En la convocatoria, **Editar publicación** abre la ficha de origen y **Ajustes de convocatoria** permite notas privadas y fecha límite. Los campos vinculados no se sobrescriben desde el formulario interno.
- Retirar, borrar o cancelar una publicación cancela su convocatoria conservando respuestas, asistencias y auditoría. Cancelar desde el portal administrativo retira también la publicación pública. Republicar reutiliza la convocatoria existente.
- Si un músico se incorpora después de la publicación, usar **Añadir nuevos músicos** en su convocatoria.
- `tests/banda-agenda.sql` verifica plantillas en verano/invierno, duplicados, permisos, rechazo de RSVP en ensayos, sincronización y cancelación sin perder historial. Finaliza con ROLLBACK.
- `tests/banda-agenda-browser.cjs` comprueba selección de fecha y plantilla, ausencia de RSVP de ensayo, formularios de publicación/edición, orden del feed público y adaptación a 320/390/1280 px.

Los campos de fecha de administración abren un calendario propio al tocarlos o pulsar **Elegir**. Permite selección por día y escritura DD/MM/AAAA o DDMMYYYY; las convocatorias admiten también HH:MM o HHMM. El valor enviado sigue siendo ISO, sin conversiones por la zona del dispositivo. Los campos de solo hora (inicio y fin de procesiones y conciertos) abren un selector de horas y minutos y permiten escribir HH:MM o HHMM. Las fechas vinculadas muestran **Desde publicación** y se cambian en la ficha de origen.

El acceso **QR de fichaje** aparece en cada convocatoria y procesión programada; los conciertos tienen **QR de fichaje de músicos**, separado del QR del programa público. Desde dos horas antes y hasta el fin, genera el QR temporal y abre la sesión de fichaje. La pantalla QR permite cerrar la sesión explícitamente; cerrar solo la pantalla no cierra el fichaje.

El despachador instalado se actualizó con la migración remota `fichaje_qr_sin_geolocalizacion`. Su definición actual está en `supabase_calendario_actuaciones.sql`; las instalaciones nuevas deben aplicar este archivo después de las migraciones anteriores. El navegador tiene geolocalización deshabilitada por Permissions-Policy.

La previsión de actuaciones agrupa a los convocados por instrumento y muestra sus nombres en **Voy**, **No voy** y **Sin responder**, con recuentos por columna. Los instrumentos y nombres se ordenan alfabéticamente; las fichas sin instrumento tienen su propio grupo. Las respuestas pendientes no se interpretan como negativas.

## Ampliación del portal: gestión de la banda

Se mantienen los permisos independientes de Administrador y Músico, la publicación a través de GitHub y el despliegue automático de Netlify. El fichaje continúa sin GPS.

1. **Avisos y recordatorios.** Los nuevos convocados reciben un aviso dentro del portal. Los cambios de horario, lugar, cancelación o ficha práctica generan avisos privados. Una función programada cada cinco minutos procesa las notificaciones y crea un recordatorio cuando quedan menos de 24 horas para responder, solo para músicos pendientes. Administración puede recordarlo manualmente, con deduplicación de tres horas. Las series de ensayos generan una sola notificación agrupada por músico. Cada músico activa o desactiva las notificaciones del portal en su dispositivo desde Avisos; se conservan independientemente los avisos del directo público mediante un servicio de notificaciones separado, sin caché de páginas. El envío requiere permiso y compatibilidad del navegador. No hay envío de correos.
2. **Convocatoria e inicio público.** En la ficha práctica se define la citación de músicos, anterior al inicio público y como máximo siete días antes. El calendario del músico y la ventana QR siguen esa convocatoria interna. La portada sigue usando la hora pública. Si se reprograma la publicación, se conserva el margen de convocatoria. El plazo de respuesta nunca queda después de la convocatoria.
3. **Ficha práctica.** Uniformidad, transporte, punto de encuentro, partituras/material y contacto son privados de la convocatoria. Se editan desde los detalles del evento y aparecen en el portal de sus músicos.
4. **Informes.** Administración consulta períodos y exporta CSV; cada músico consulta su propio resumen. Hay acceso al mes y a la temporada de septiembre a agosto, además del rango libre de fechas. Solo cuentan citas finalizadas y no canceladas. Se separan presentes, ausentes, justificadas, incidencias y sin fichaje. El porcentaje representa presencias registradas sobre convocatorias finalizadas; los registros desconocidos no se convierten en ausencias.
5. **Justificaciones.** Tras indicar No voy en una actuación, el músico puede explicar su motivo hasta el fin de la actuación. Solo él y administración pueden leerlo. La junta acepta/rechaza y puede responder en privado. Editar un motivo lo devuelve a pendiente. Cambiar a Voy retira el justificante y conserva la operación anterior en auditoría. Una aprobación cuenta como justificada en el informe cuando no existe una asistencia explícita; no sobrescribe un fichaje ni una revisión manual.
6. **Ensayos recurrentes.** Seleccionar período, días y plantilla, revisar la vista previa y desmarcar festivos. Límite de seis meses y 60 fechas por tanda. El servidor omite duplicados y crea la tanda de forma atómica. No pide RSVP.
7. **Objetivos por instrumento.** Introducir líneas como Clarinete: 6. La previsión nominal conserva Voy/No voy/Sin responder y muestra objetivo, confirmados y déficit. También se ven instrumentos requeridos sin músicos convocados.
8. **Hoy · Junta.** Muestra los eventos del día según su convocatoria, confirmaciones, presencias y casos sin fichaje. Permite abrir el QR y acceder a los músicos; se actualiza cada 30 segundos mientras la pestaña de administración está visible.

### Instalación de esta ampliación

Después de las migraciones anteriores del área, aplicar los archivos de `supabase/migrations/` por orden. La base instalada ya está actualizada. Las tablas nuevas tienen RLS, los motivos son privados y las suscripciones push solo son accesibles a las funciones del servidor. `public.banda_portal_accion` es un envoltorio invocador; sus operaciones comprueban cuenta, permiso y convocatoria. La cola `public.banda_avisos_lote` solo se concede a service_role. Las funciones reutilizan SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y las tres variables VAPID existentes. Las claves privadas nunca se envían al navegador. Las rutas `/netlify/*` se bloquean como contenido estático.

Validación: `tests/banda-portal.sql` termina en ROLLBACK y comprueba privacidad, informes propios, avisos, deduplicación, festivos, convocatoria anticipada y QR sin GPS. `tests/banda-portal-browser.cjs` recorre los formularios y las seis vistas, incluidos permisos de avisos simulados, a 320/390/1280 px. `tests/banda-push.test.cjs` prueba autenticación, destinatarios y envíos con proveedores simulados, sin notificar a usuarios reales. El envío real necesita un navegador que haya activado la suscripción.
