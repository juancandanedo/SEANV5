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
