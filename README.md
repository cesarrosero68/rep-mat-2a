# REP-MAT-2A

Prompt para Lovable — App Educativa por Materias y Semanas

Contexto

Construye una aplicación web educativa para un estudiante de colegio. La app organiza el contenido escolar por Materia → Periodo → Semana, permitiendo que el estudiante avance a su propio ritmo (incluso adelantándose). Debe ser visual, simple y sin distracciones — el estudiante NO debe tener que salir de la app para ver PDFs o videos de YouTube.

REQUISITO CRÍTICO: toda la gestión de datos debe poder hacerse por SQL, sin gastar créditos de Lovable

Este es un requisito de diseño, no un detalle secundario. El objetivo es que cargar materias, periodos, semanas, contenido (PDFs, links de YouTube) y progreso se pueda hacer 100% desde el SQL Editor de Supabase, directamente sobre las tablas, sin tener que pedirle nada a Lovable por prompt (lo cual consume créditos).

Esto implica que la construcción de la app debe seguir estas reglas:

Todo el contenido vive en tablas de Supabase, nunca hardcodeado en el código React/frontend. Materias, periodos, semanas, PDFs y links de YouTube deben leerse dinámicamente desde la base de datos. Si algo queda "quemado" en el código, ya no se puede editar por SQL.

El frontend debe ser un consumidor puro de las tablas: se construye una sola vez la interfaz (vistas de materia, semana, checklist), y a partir de ahí, agregar una semana nueva, cambiar un PDF, corregir un video, marcar progreso, etc. son operaciones de datos, no cambios de código. Esto significa que después de la construcción inicial, casi nunca debería ser necesario volver a pedirle algo a Lovable.

Los PDFs se suben directamente a Supabase Storage por SQL/API, sin depender del panel admin visual. El panel admin en la app es un "nice to have" para comodidad, pero la vía principal para cargar contenido en lote debe ser: subir el archivo al bucket de Storage (por la interfaz de Supabase o su API) + un INSERT/UPDATE en week_content con la URL resultante. Esto se puede hacer sin tocar Lovable en absoluto.

La extracción de texto y detección de links de YouTube no debe depender de una función que solo se dispare desde la UI de Lovable. Debe implementarse como una Supabase Edge Function invocable directamente (por SQL trigger, webhook de Storage, o llamada HTTP directa), de forma que si se sube un PDF por SQL/Storage API, el procesamiento ocurra igual, sin pasar por la app.

Todas las tablas deben tener políticas RLS ya definidas desde el inicio (lectura pública para el estudiante, escritura para el rol autenticado/admin) para que las operaciones por SQL Editor no choquen con permisos y no requieran ir a Lovable a "arreglar" nada.

Evitar cualquier lógica de negocio que solo exista en el frontend. Ej.: si el checklist calcula "semanas completadas" o "progreso por materia", ese cálculo debe poder reproducirse también con una consulta SQL directa (ver ejemplos en el script de schema), no solo mediante JavaScript en el cliente.

En resumen: la única vez que se debe "gastar créditos" en Lovable es para construir o modificar la interfaz (cómo se ve y cómo se navega la app). Cualquier tarea de contenido (cargar semanas, materias, PDFs, videos, corregir datos, marcar progreso) debe resolverse con SQL o con las herramientas nativas de Supabase (Table Editor, Storage, SQL Editor), sin volver a interactuar con el asistente de Lovable.

Roles

Admin (padre): sube contenido desde un panel simple.

Estudiante: consume el contenido y marca su progreso con un checklist.

No se requiere login para el estudiante. El admin sí necesita autenticación (Supabase Auth, email/password, un solo usuario admin).

Estructura de datos (Supabase)

Tabla subjects (materias) — datos fijos iniciales

ENGLISH

MATEMATICAS

SOCIALES

LITERATURE

CIENCIAS NATURALES

LENGUA CASTELLANA

RELIGION, ETICA Y VALORES

MUSICA

EDUCACION FISICA

EXPRESION ARTISTICA

STEAM

CURRENT EVENTS

DANZAS

Campos: id, name, color (para diferenciarlas visualmente), icon (nombre de ícono, puede usar lucide-react), order.

Tabla periods (periodos) — datos fijos iniciales

Period 1

Period 2

Period 3

Campos: id, name, order.

Tabla weeks (semanas) — datos fijos iniciales, asociadas a un período

Precargar estas semanas con su período correspondiente:

Period 1: Feb 2-6, Feb 9-13, Feb 16-20, Feb 23-27, Mar 2-6, Mar 9-13, Mar 16-20, Mar 23-27, Mar 30-Abr 3, Abr 6-10, Abr 13-17, Abr 20-24, Abr 27-May 1

Period 2: May 4-8, May 11-15, May 18-22, May 25-29, Jun 1-5, Jun 8-12, Jun 15-Jul 6, Jul 6-10, Jul 13-17, Jul 20-24, Jul 27-31, Ago 3-7, Ago 10-14

Period 3: Ago 17-21, Ago 24-28, Ago 31-Sep 4

Campos: id, period_id, label (texto tal cual, ej. "FEBRUARY 2ND - 6TH"), start_date, end_date, order.

Tabla week_content (contenido por materia+semana)

Esta es la tabla central: relaciona una materia con una semana y contiene el PDF subido.

Campos:

id

subject_id (FK)

week_id (FK)

pdf_url (almacenado en Supabase Storage)

pdf_filename

extracted_text (texto plano extraído del PDF, para búsqueda/respaldo)

youtube_links (array de objetos: {video_id, title, position_in_doc}) — extraídos automáticamente del PDF

created_at, updated_at

Tabla progress (checklist del estudiante)

Campos:

id

week_content_id (FK)

completed (boolean)

completed_at

No requiere user_id ya que es un solo estudiante sin login. Si en el futuro se agregan más hijos, se puede añadir student_id.

Funcionalidad: subida y procesamiento de PDF (Edge Function)

Al subir un PDF desde el panel admin:

Guardar el archivo original en Supabase Storage (bucket week-pdfs).

Extraer el texto completo del PDF usando una librería de extracción (ej. pdf-parse o similar en una Edge Function de Supabase).

Escanear el texto extraído buscando URLs de YouTube con regex (patrones youtube.com/watch?v=, youtu.be/).

Por cada URL encontrada, extraer el video_id y guardarlo en youtube_links con la posición aproximada donde aparece en el documento (para poder mostrarlo en orden).

Guardar extracted_text completo como respaldo.

Panel Admin

Pantalla simple con:

Selector de Materia (dropdown con las 13 materias).

Selector de Semana (dropdown agrupado por periodo).

Zona de carga de PDF (drag & drop o click).

Al subir, mostrar preview de: el PDF cargado + lista de links de YouTube detectados automáticamente (con miniatura del video).

Permitir editar manualmente el título de cada video detectado, o agregar uno manualmente si no fue detectado.

Botón "Guardar".

Vista de tabla: qué materias/semanas ya tienen contenido cargado y cuáles están vacías (para llevar control visual del avance de carga).

Vista del Estudiante

Pantalla de inicio

Grid de tarjetas grandes, una por materia, con su color e ícono.

Cada tarjeta muestra un indicador de progreso (ej. "12/31 semanas completadas").

Vista de Materia

Lista de periodos como pestañas o acordeones (Period 1, 2, 3).

Dentro de cada periodo, lista de semanas en orden cronológico.

Cada semana muestra: su label (ej. "FEBRUARY 2ND - 6TH"), un check verde si está completada, y si tiene contenido cargado o no (semanas sin contenido se muestran deshabilitadas o con "Próximamente").

El estudiante puede entrar a cualquier semana sin restricción de orden (para poder adelantarse).

Vista de Semana (la pantalla clave)

Al entrar a una semana específica de una materia:

Visor de PDF embebido en la parte superior — página por página, con zoom y navegación (usar react-pdf o pdf.js embebido, NO un link que abra en nueva pestaña).

Debajo del visor, sección "Videos de esta semana": tarjetas con miniatura de cada video de YouTube detectado, tituladas. Al hacer clic, el video se reproduce embebido en un modal o expandido en la misma pantalla (iframe de YouTube), sin salir de la app.

Al final de la pantalla: un checkbox grande y simple — "Ya completé esta semana" — que marca progress.completed = true. Debe sentirse satisfactorio (una animación simple de confirmación está bien).

Botones de navegación "Semana anterior" / "Semana siguiente" dentro de la misma materia.

Diseño visual

Colores vivos y diferenciados por materia, pero limpio — pensado para que un niño/adolescente lo use sin fricción.

Tipografía grande y clara.

Mobile-first: la app debe verse y usarse bien en celular o tablet, no solo en computador.

Evitar cualquier elemento que parezca "panel de administración" en la vista del estudiante — debe sentirse como una app de aprendizaje, no una base de datos.

Prioridad de construcción (fases)

Estructura de datos (tablas + RLS, cargadas por SQL) + vista de estudiante conectada directamente a esas tablas. Sin panel admin todavía: el contenido inicial se carga por SQL Editor / Storage.

Visor de PDF embebido y checklist funcionando, leyendo pdf_url y escribiendo en progress directamente contra Supabase.

Extracción automática de texto y detección de links de YouTube como Edge Function independiente de la UI (invocable por trigger de Storage), para que funcione igual si el PDF se sube por SQL/API o por un panel admin futuro.

Reproductor de YouTube embebido usando los links detectados (youtube_links en week_content).

(Opcional, solo si se necesita comodidad visual) Panel admin simple dentro de la app — pero la vía SQL/Storage debe seguir funcionando igual, no ser reemplazada por el panel.

Indicadores de progreso y pulido visual.

Control de versiones: GitHub

Conecta el proyecto de Lovable a un repositorio de GitHub desde el inicio (Lovable tiene integración nativa para esto, sin consumo adicional de créditos por la sincronización en sí). Esto sirve para:

Tener respaldo e historial del código de la interfaz, independiente de Lovable.

Poder revertir cambios sin necesidad de regenerar con IA (y por lo tanto sin gastar créditos).

Versionar en el mismo repo los scripts SQL de Supabase (schema, migraciones, datos de referencia) en una carpeta tipo /supabase/sql, de modo que el estado completo del proyecto — interfaz y estructura de datos — quede documentado en un solo lugar aunque Lovable y Supabase sean sistemas separados.

Permitir editar el código directamente (clonando el repo) si en algún momento se prefiere hacer un ajuste manual en vez de pedírselo a Lovable.

Nota final para Lovable

No generes contenido, materias, semanas ni lógica de negocio hardcodeada dentro de componentes React. Todo debe leerse de las tablas de Supabase ya definidas por SQL, de modo que cualquier cambio de contenido futuro se haga directamente en la base de datos sin necesidad de una nueva generación de código.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://rep-mat-2a.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2a1f6875-484c-47a5-b663-036129eb2a23).

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
