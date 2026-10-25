# Seminarios · Cobros y Notas (Netlify)

App web que reemplaza la app de AppSheet: estudiantes, cobros/deudas, notas, tutores, salones, libros y reportes.
Sin paso de build: HTML/JS estático + una Netlify Function (`/api/*`) + **Netlify Blobs** como base de datos.

## Roles
| Rol | Puede |
|---|---|
| Administrador | Todo: cobros, notas, estudiantes, catálogos, usuarios, ajustes |
| Tesorería | Cobros, estado de cuenta, reportes de ingresos/morosos (no ve notas) |
| Tutor | Solo sus grupos (según el ID de tutor vinculado): captura y consulta notas (no ve cobros) |

## Desplegar
**Opción A (recomendada): GitHub → Netlify**
1. Crea un repositorio **privado** en GitHub y sube esta carpeta (`seed/seed.json` contiene teléfonos y correos de estudiantes: no lo hagas público).
2. En Netlify: *Add new site → Import an existing project* → elige el repo. Netlify lee `netlify.toml` (publish `public`, functions `netlify/functions`). Deploy.
3. Abre la URL del sitio. La primera vez aparece **Configuración inicial**: crea tu usuario administrador y la app carga automáticamente los datos de tus 7 hojas.
4. Entra a *Usuarios* y crea las cuentas de Tesorería y de cada tutor (vinculando el ID de tutor, p. ej. PAN-106).

**Opción B: CLI**  `npm i -g netlify-cli && npm install && netlify deploy --prod`

Variable opcional `JWT_SECRET` (si no existe, la app genera y guarda una propia).

## Desarrollo local
`npm install && npx netlify dev` → http://localhost:8888 (Blobs funciona en modo local).
Pruebas: `node tests/api.test.mjs`

## Datos y reglas de negocio
- **Saldo** = Σ cargos (DEBE) − Σ pagos. Saldo positivo = debe; negativo = crédito a favor.
- **Nota %** = nota / total de puntos. Aprueba con ≥ *nota mínima* (Usuarios → Ajustes; por defecto 70%).
- **Grupo** `2025N2L3-106-1` = año · nivel/libro (N2L3) · ID de tutor (PAN-106) · secuencia. De ahí se deduce el tutor de cada inscripción.
- Se unificó el libro duplicado «Vida Resucitada» (IDs f401b8bd y 81879993) en un solo registro.
- Los tipos de pago (BL-JCC, BL-Iglesia, EF-Iglesia, BecaDFP) quedaron como catálogo editable.
- Regenerar la semilla desde nuevos xlsx: `python3 tools/build_seed.py <carpeta>` (solo afecta instalaciones nuevas).

## Comprobantes de pago (imágenes)
- Al registrar/editar un pago se puede adjuntar una foto; se reduce a 1600 px (JPEG) y se guarda en Netlify Blobs (store `comprobantes`).
- En *Cobros*, el botón 📎 abre el comprobante. Solo Administrador y Tesorería pueden verlos.
- **Importar los 323 comprobantes existentes:** *Cobros → Importar comprobantes* y elige las fotos de la carpeta `ENTRADAS_Images` de AppSheet (Ctrl+A). Se asocian por nombre de archivo (ej. `137e716e.IMAGEN.142316.jpg`).

## Recuperar contraseña de administrador
1. En Netlify: *Site configuration → Environment variables* → agrega `RECOVERY_KEY` con un valor largo (≥ 12 caracteres). Haz un nuevo deploy.
2. En la pantalla de login, «¿Olvidaste tu contraseña?» → usuario, nueva contraseña y la clave.
3. Al terminar, **borra** la variable `RECOVERY_KEY` (deshabilita la recuperación).

## Grupos
Módulo *Grupos*: cada grupo une **año + libro + tutor + salón + horario + estado** y lista sus estudiantes inscritos (el admin inscribe/quita). Cambiar tutor, libro o año de un grupo se propaga a todas sus inscripciones. Los grupos existentes se crean automáticamente a partir de tus inscripciones (el salón queda «Sin salón» hasta asignarlo).

## Asistencia y pruebas (Manual del Tutor, pág. 54)
- *Asistencia → Registrar semana*: por grupo y semana (1-12) el tutor marca **asistencia** (puntual / tarde / falta) y **pruebas** (correcta / incompleta / no hecha).
- Cálculo: asistencia = 100 − 5 por tarde − 10 por falta; pruebas = 100 − 5 por incompleta − 10 por no hecha; examen final = 100 − 1 por cada error; **total = promedio de las tres**. Aprueba con **≥ 80%** (Usuarios → Ajustes → nota mínima).
- *Registro del grupo y notas finales*: matriz equivalente al «Registro» del manual, con examen (por errores), total y resultado; exportable a Excel e imprimible.
- Un tutor solo registra en sus propios grupos. Quitar a un estudiante de un grupo borra su asistencia.
