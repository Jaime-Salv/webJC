# Área de músicos JC

## Puesta en marcha

1. Cada persona inicia sesión con Google. Su perfil se crea como público general.
2. En **Admin → Usuarios**, marcar el permiso **Músico**. **Administrador** es un permiso independiente: se pueden marcar ambos. No hay solicitud ni elección de rol en el registro.
3. En **Ficha musical**, completar nombre, instrumento y año de incorporación. El músico puede cambiar nombre e instrumento en **Mi ficha musical**, dentro del portal; el año queda reservado a administración.
4. En **Admin → Músicos**, seleccionar un día del calendario y colocar **Ensayo tarde** (20:30–22:00) o **Ensayo mañana** (12:00–14:00), en el local de la banda. La ubicación habitual se guarda una vez y se copia a los próximos ensayos. Programar las actuaciones desde su publicación de concierto o procesión. Las horas se introducen en horario de Madrid. Solo las cuentas con permiso Músico quedan convocadas, incluidas las que también son administradoras. Usar **Añadir nuevos músicos** para incorporar altas posteriores a la convocatoria.
5. El músico accede desde la pestaña **Portal músico** de la navegación principal y responde **Voy / No voy** en las actuaciones hasta el plazo. Los ensayos no requieren respuesta previa ni cuentan como pendientes. No responder se mantiene como estado independiente.
6. Para fichar, configurar el punto de llegada y radio (150 m por defecto), abrir el fichaje desde dos horas antes del evento y mostrar el QR. La apertura dura como máximo dos horas y nunca supera el fin previsto; puede reabrirse dentro del horario permitido.
7. Mantener una sola pantalla QR por evento. El código cambia cada 60 segundos. Escanear con la cámara del móvil, iniciar sesión y pulsar **Comprobar ubicación y fichar**. Si se inicia sesión y caduca el QR, volver a escanear.
8. Cerrar el fichaje al terminar. Revisar incidencias y músicos sin fichaje, y exportar el CSV si se necesita.

## Pantallas del portal

- **Resumen:** próxima convocatoria, respuestas pendientes, presencias e incidencias y acceso a la ficha musical.
- **Calendario:** navegar meses y consultar eventos por día; ensayos y actuaciones se distinguen por sus indicadores.
- **Confirmaciones:** responder Voy / No voy en actuaciones; los ensayos muestran solamente la información y el acceso al fichaje; buscar por título o lugar y filtrar por pendientes, ensayos o actuaciones.
- **Mis asistencias:** historial individual con el resultado y los motivos de revisión.
- **Escanear QR:** abrir cámara tras pulsar el botón, leer una imagen de la galería o pegar el enlace. Las imágenes se procesan localmente y solo se aceptan enlaces de asistencia de esta misma web. Leer el código prepara el fichaje; pulsar Confirmar mi asistencia solicita la ubicación y envía el registro.

La cámara trasera se solicita sin micrófono y se cierra al reconocer un QR, cambiar de vista, ocultar la página o salir de ella. Los mensajes ofrecen alternativas si se deniega el permiso. La política del servidor permite la cámara únicamente en la ruta del portal. Una conexión HTTPS y los permisos del navegador son necesarios para el escaneo en vivo. Se sigue pudiendo escanear desde la cámara nativa del móvil.

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
- En la convocatoria, **Editar publicación** abre la ficha de origen y **Ajustes de convocatoria** permite notas privadas, fecha límite y ubicación. Los campos vinculados no se sobrescriben desde el formulario interno.
- Retirar, borrar o cancelar una publicación cancela su convocatoria conservando respuestas, asistencias y auditoría. Cancelar desde el portal administrativo retira también la publicación pública. Republicar reutiliza la convocatoria existente.
- Si un músico se incorpora después de la publicación, usar **Añadir nuevos músicos** en su convocatoria.
- `tests/banda-agenda.sql` verifica plantillas en verano/invierno, duplicados, permisos, rechazo de RSVP en ensayos, sincronización y cancelación sin perder historial. Finaliza con ROLLBACK.
- `tests/banda-agenda-browser.cjs` comprueba selección de fecha y plantilla, ausencia de RSVP de ensayo, formularios de publicación/edición, orden del feed público y adaptación a 320/390/1280 px.

Los campos de fecha de administración abren un calendario propio al tocarlos o pulsar **Elegir**. Permite selección por día y escritura DD/MM/AAAA o DDMMYYYY; las convocatorias admiten también HH:MM o HHMM. El valor enviado sigue siendo ISO, sin conversiones por la zona del dispositivo. Los campos de solo hora (inicio y fin de procesiones y conciertos) abren un selector de horas y minutos y permiten escribir HH:MM o HHMM. Las fechas vinculadas muestran **Desde publicación** y se cambian en la ficha de origen.

El acceso **QR de fichaje** aparece en cada convocatoria y procesión programada; los conciertos tienen **QR de fichaje de músicos**, separado del QR del programa público. Si falta la ubicación, abre sus ajustes. Desde dos horas antes y hasta el fin, genera el QR temporal y abre la sesión de fichaje. La pantalla QR permite cerrar la sesión explícitamente; cerrar solo la pantalla no cierra el fichaje.
