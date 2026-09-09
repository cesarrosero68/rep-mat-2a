# Cómo cargar contenido sin tocar la app

Todo el contenido vive en la base de datos. La interfaz solo lee estas tablas,
así que agregar semanas, PDFs o videos es siempre una operación de datos.

## Tablas

- `subjects` — materias (nombre, color, icono de lucide-react, orden)
- `periods` — Period 1 / 2 / 3
- `weeks` — semanas (period_id, label, start_date, end_date, order)
- `week_content` — una fila por materia + semana: `pdf_url`, `pdf_filename`,
  `extracted_text`, `youtube_links` (jsonb)
- `progress` — una fila por `week_content_id` con `completed`

## 1. Subir un PDF

Sube el archivo al bucket de Storage `week-pdfs` (por la interfaz de Storage o
su API). Luego guarda la ruta dentro del bucket:

```sql
insert into week_content (subject_id, week_id, pdf_url, pdf_filename)
select s.id, w.id, 'ingles/feb-2-6.pdf', 'feb-2-6.pdf'
from subjects s, weeks w
where s.name = 'ENGLISH' and w.label = 'FEBRUARY 2ND - 6TH'
on conflict (subject_id, week_id) do update
set pdf_url = excluded.pdf_url, pdf_filename = excluded.pdf_filename;
```

`pdf_url` acepta tanto una ruta dentro del bucket (`carpeta/archivo.pdf`) como
una URL completa `https://...`.

## 2. Agregar videos de YouTube

```sql
update week_content
set youtube_links = '[
  {"video_id":"dQw4w9WgXcQ","title":"Present simple","position_in_doc":1},
  {"video_id":"abc123","title":"Práctica","position_in_doc":2}
]'::jsonb
where id = '...';
```

## 3. Marcar progreso

```sql
insert into progress (week_content_id, completed)
values ('...', true)
on conflict (week_content_id) do update set completed = excluded.completed;
```

## 4. Consultar avance (misma lógica que la app)

```sql
select * from subject_progress order by name;

-- semanas sin contenido cargado, por materia
select s.name, w.label
from subjects s
cross join weeks w
left join week_content wc on wc.subject_id = s.id and wc.week_id = w.id
where wc.id is null
order by s."order", w."order";
```

## Permisos

Lectura pública en `subjects`, `periods`, `weeks`, `week_content` y `progress`.
Escritura de contenido solo para usuarios autenticados; el progreso se puede
escribir sin sesión (el estudiante no necesita login).
