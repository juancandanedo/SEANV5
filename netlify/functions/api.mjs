import crypto from "node:crypto";
import { readKey, mutate, store, files } from "../lib/store.mjs";
import { hashPassword, checkPassword, sign, verify, cookieOf } from "../lib/auth.mjs";
import seed from "../../seed/seed.json" with { type: "json" };

export const config = { path: "/api/*" };

const COLS = ["estudiantes", "tutores", "salones", "niveles", "tipos_pago", "grupos", "cursos", "notas", "asistencia", "cobros"];
const ROLES = ["admin", "tesoreria", "tutor"];
// Permisos por rol: lectura / escritura
const PERM = {
  admin: { read: COLS, write: COLS },
  tesoreria: { read: ["estudiantes", "tutores", "salones", "niveles", "tipos_pago", "grupos", "cursos", "cobros"], write: ["cobros"] },
  tutor: { read: ["estudiantes", "tutores", "salones", "niveles", "tipos_pago", "grupos", "cursos", "notas", "asistencia"], write: ["notas"] },
};
const DEFAULT_SETTINGS = { nota_minima: 80, precio_libro: 25, nombre_programa: "Seminarios" };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
const fail = (status, error) => Object.assign(new Error(error), { status });
const newId = () => crypto.randomBytes(4).toString("hex");
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw fail(400, `${name} debe ser numérico`); return n; };
const str = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim());
const req_ = (v, name) => { const s = str(v); if (!s) throw fail(400, `${name} es obligatorio`); return s; };

// ---------- acceso a colecciones ----------
const getCol = (c) => (c === "grupos" ? ensureGrupos() : readKey("col_" + c, []));
// Migración perezosa: si la colección "grupos" no existe (instalaciones previas), se deduce de las inscripciones.
async function ensureGrupos() {
  const g = await readKey("col_grupos", null);
  if (g) return g;
  const m = new Map();
  for (const c of await readKey("col_cursos", [])) if (!m.has(c.grupo)) m.set(c.grupo, { id: c.grupo, anio: c.anio, curso: c.curso, tutor_id: c.tutor_id, salon_id: null, horario: null, estado: c.anio < 2026 ? "FINALIZADO" : "ACTIVO" });
  const init = [...m.values()];
  await store().setJSON("col_grupos", init, { onlyIfNew: true });
  return readKey("col_grupos", init);
}
async function ensureSeeded() {
  const users = await readKey("users", null);
  return users && users.length > 0;
}

// Alcance de un tutor: sus cursos, estudiantes y notas
async function tutorScope(user) {
  const cursos = (await getCol("cursos")).filter((c) => c.tutor_id === user.tutor_id);
  const cursoIds = new Set(cursos.map((c) => c.id));
  const estIds = new Set(cursos.map((c) => c.estudiante_id));
  return { cursos, cursoIds, estIds };
}

async function listFor(user, col) {
  let rows = await getCol(col);
  if (user.rol === "tutor") {
    const sc = await tutorScope(user);
    if (col === "cursos") rows = sc.cursos;
    else if (col === "grupos") rows = rows.filter((g) => g.tutor_id === user.tutor_id);
    else if (col === "estudiantes") rows = rows.filter((e) => sc.estIds.has(e.id));
    else if (col === "notas" || col === "asistencia") rows = rows.filter((n) => sc.cursoIds.has(n.curso_reg_id));
  }
  return rows;
}

// ---------- validación por colección ----------
async function normalize(col, body, existing) {
  const b = { ...(existing || {}), ...body };
  switch (col) {
    case "estudiantes":
      return { id: b.id, nombre: req_(b.nombre, "Nombre"), email: str(b.email), telefono: str(b.telefono), sede: str(b.sede) };
    case "tutores":
      return { id: req_(b.id, "ID del tutor"), nombre: req_(b.nombre, "Nombre"), nivel: num(b.nivel, "Nivel") };
    case "salones":
      return { id: req_(b.id, "ID del salón"), ubicacion: req_(b.ubicacion, "Ubicación"), sede: str(b.sede) };
    case "niveles":
      return { id: b.id, nivel: num(b.nivel, "Nivel"), libro: num(b.libro, "Libro"), nombre: req_(b.nombre, "Nombre del libro").toUpperCase() };
    case "tipos_pago":
      return { id: req_(b.id || b.nombre, "Nombre"), nombre: req_(b.nombre || b.id, "Nombre"), descripcion: str(b.descripcion) };
    case "grupos": {
      const curso = req_(b.curso, "Libro/curso").toUpperCase();
      if (!/^N\dL\d$/.test(curso)) throw fail(400, "Curso con formato N#L# (ej. N2L3)");
      const anio = num(b.anio, "Año");
      if (anio < 2000 || anio > 2100) throw fail(400, "Año inválido");
      const tutor_id = req_(b.tutor_id, "Tutor");
      if (!(await getCol("tutores")).some((t) => t.id === tutor_id)) throw fail(400, "El tutor no existe");
      const salon_id = str(b.salon_id);
      if (salon_id && !(await getCol("salones")).some((x) => x.id === salon_id)) throw fail(400, "El salón no existe");
      const estado = str(b.estado) || "ACTIVO";
      if (!["ACTIVO", "FINALIZADO"].includes(estado)) throw fail(400, "Estado inválido");
      return { id: b.id, anio, curso, tutor_id, salon_id, horario: str(b.horario), estado };
    }
    case "cursos": {
      const grupo = req_(b.grupo, "Grupo");
      const g = (await getCol("grupos")).find((x) => x.id === grupo);
      if (!g) throw fail(400, "El grupo no existe; créalo primero en Grupos");
      const estudiante_id = req_(b.estudiante_id, "Estudiante");
      if (!(await getCol("estudiantes")).some((e) => e.id === estudiante_id)) throw fail(400, "Estudiante no existe");
      return { id: b.id, estudiante_id, grupo, curso: g.curso, anio: g.anio, tutor_id: g.tutor_id, descripcion: str(b.descripcion) };
    }
    case "notas": {
      const curso_reg_id = req_(b.curso_reg_id, "Curso");
      const curso = (await getCol("cursos")).find((c) => c.id === curso_reg_id);
      if (!curso) throw fail(400, "El curso no existe");
      const nota = num(b.nota, "Nota"), total = num(b.total, "Total de puntos");
      if (total <= 0) throw fail(400, "El total de puntos debe ser mayor que 0");
      if (nota < 0 || nota > total) throw fail(400, "La nota debe estar entre 0 y el total de puntos");
      const mod = str(b.modalidad);
      if (mod && !["PRESENCIAL", "VIRTUAL"].includes(mod)) throw fail(400, "Modalidad inválida");
      return { id: b.id, curso_reg_id, estudiante_id: curso.estudiante_id, nota, total, modalidad: mod, fecha_examen: str(b.fecha_examen), tipo_pase: str(b.tipo_pase) };
    }
    case "cobros": {
      const estudiante_id = req_(b.estudiante_id, "Estudiante");
      if (!(await getCol("estudiantes")).some((e) => e.id === estudiante_id)) throw fail(400, "Estudiante no existe");
      const fecha = req_(b.fecha, "Fecha");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw fail(400, "Fecha inválida");
      const debe = b.debe === "" || b.debe == null ? 0 : num(b.debe, "Debe");
      const pago = b.pago === "" || b.pago == null ? 0 : num(b.pago, "Pago");
      if (debe < 0 || pago < 0) throw fail(400, "Los montos no pueden ser negativos");
      if (debe === 0 && pago === 0) throw fail(400, "Indica un monto en DEBE (cargo) o en PAGO");
      if (debe > 0 && pago > 0) throw fail(400, "Un movimiento es un cargo (DEBE) o un pago, no ambos");
      const tipo_pago = str(b.tipo_pago);
      if (pago > 0) {
        if (!tipo_pago) throw fail(400, "El tipo de pago es obligatorio para un pago");
        if (!(await getCol("tipos_pago")).some((t) => t.id === tipo_pago)) throw fail(400, "Tipo de pago no existe");
      }
      const nivel_id = str(b.nivel_id);
      let libro = b.libro === "" || b.libro == null ? null : num(b.libro, "Libro");
      if (nivel_id) {
        const n = (await getCol("niveles")).find((x) => x.id === nivel_id);
        if (!n) throw fail(400, "Libro/nivel no existe");
        libro = n.libro;
      }
      return { id: b.id, fecha, estudiante_id, libro, nivel_id, debe, pago, tipo_pago: pago > 0 ? tipo_pago : null, notas: str(b.notas), imagen: str(b.imagen) };
    }
  }
  throw fail(404, "Colección desconocida");
}

// Integridad al borrar
async function checkDelete(col, id) {
  const used = async (c, f) => (await getCol(c)).filter((r) => r[f] === id).length;
  if (col === "estudiantes") {
    const n = (await used("cobros", "estudiante_id")) + (await used("cursos", "estudiante_id"));
    if (n) throw fail(409, `No se puede borrar: el estudiante tiene ${n} registros de cobros/cursos`);
  } else if (col === "cursos") {
    if (await used("notas", "curso_reg_id")) throw fail(409, "No se puede borrar: el curso tiene notas registradas");
  } else if (col === "niveles") {
    if (await used("cobros", "nivel_id")) throw fail(409, "No se puede borrar: hay cobros con este libro");
  } else if (col === "tipos_pago") {
    if (await used("cobros", "tipo_pago")) throw fail(409, "No se puede borrar: hay pagos con este tipo");
  } else if (col === "grupos") {
    const n = await used("cursos", "grupo");
    if (n) throw fail(409, `No se puede borrar: el grupo tiene ${n} estudiantes inscritos`);
  } else if (col === "salones") {
    if ((await getCol("grupos")).some((g) => g.salon_id === id)) throw fail(409, "No se puede borrar: hay grupos en este salón");
  } else if (col === "tutores") {
    if ((await getCol("grupos")).some((g) => g.tutor_id === id) || (await getCol("cursos")).some((c) => c.tutor_id === id)) throw fail(409, "No se puede borrar: el tutor tiene grupos");
  }
}

// ---------- usuarios ----------
const pubUser = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, tutor_id: u.tutor_id || null, activo: u.activo !== false });

function validateUser(b, isNew) {
  const usuario = req_(b.usuario, "Usuario").toLowerCase();
  if (!/^[a-z0-9._@-]{3,40}$/.test(usuario)) throw fail(400, "Usuario: 3-40 caracteres (letras, números . _ - @)");
  const rol = b.rol;
  if (!ROLES.includes(rol)) throw fail(400, "Rol inválido");
  if (rol === "tutor" && !str(b.tutor_id)) throw fail(400, "Un usuario tutor debe estar vinculado a un ID de tutor");
  if (isNew || b.password) { if (!b.password || String(b.password).length < 8) throw fail(400, "La contraseña debe tener al menos 8 caracteres"); }
  return { usuario, nombre: req_(b.nombre, "Nombre"), rol, tutor_id: rol === "tutor" ? str(b.tutor_id) : null, activo: b.activo !== false };
}

// ---------- ruteo ----------
export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    const method = req.method;
    const isFile = parts[0] === "comprobante";
    const body = ["POST", "PUT", "PATCH"].includes(method) && !isFile ? await req.json().catch(() => ({})) : {};
    const secure = url.protocol === "https:" ? "; Secure" : "";
    const setCookie = (t, maxAge) => ({ "set-cookie": `sid=${t}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}` });

    // --- públicas ---
    if (parts[0] === "session" && method === "GET") {
      const setup = !(await ensureSeeded());
      const p = await verify(cookieOf(req, "sid"));
      if (!p) return json({ user: null, needsSetup: setup });
      const u = (await readKey("users", [])).find((x) => x.id === p.uid);
      if (!u || u.activo === false) return json({ user: null, needsSetup: setup }, 200, setCookie("", 0));
      return json({ user: pubUser(u), needsSetup: false, settings: { ...DEFAULT_SETTINGS, ...(await readKey("settings", {})) } });
    }
    if (parts[0] === "setup" && method === "POST") {
      if (await ensureSeeded()) throw fail(403, "La aplicación ya fue configurada");
      const v = validateUser({ ...body, rol: "admin" }, true);
      const { salt, hash } = hashPassword(body.password);
      const admin = { id: newId(), ...v, salt, hash };
      for (const c of COLS) await store().setJSON("col_" + c, seed[c] ?? [], { onlyIfNew: true }); // nunca pisa datos existentes
      await store().setJSON("settings", DEFAULT_SETTINGS, { onlyIfNew: true });
      await store().setJSON("users", [admin]);
      return json({ user: pubUser(admin) }, 200, setCookie(await sign({ uid: admin.id }), 604800));
    }
    // Recuperación: requiere la variable de entorno RECOVERY_KEY definida en Netlify por el dueño del sitio.
    if (parts[0] === "recovery" && method === "POST") {
      const key = process.env.RECOVERY_KEY;
      await new Promise((ok) => setTimeout(ok, 500));
      if (!key || key.length < 12) throw fail(403, "Recuperación no habilitada: define RECOVERY_KEY (mín. 12 caracteres) en Netlify");
      const a = Buffer.from(String(body.key || "")), b = Buffer.from(key);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw fail(403, "Clave de recuperación incorrecta");
      if (!body.password || String(body.password).length < 8) throw fail(400, "La contraseña debe tener al menos 8 caracteres");
      const usuario = String(body.usuario || "").toLowerCase().trim();
      const { salt, hash } = hashPassword(String(body.password));
      await mutate("users", (arr) => {
        const i = arr.findIndex((x) => x.usuario === usuario);
        if (i < 0) throw fail(404, "Usuario no encontrado");
        return { value: arr.map((x, j) => (j === i ? { ...x, salt, hash, activo: true } : x)), result: true };
      }, []);
      return json({ ok: true });
    }
    if (parts[0] === "login" && method === "POST") {
      const usuario = String(body.usuario || "").toLowerCase().trim();
      const u = (await readKey("users", [])).find((x) => x.usuario === usuario);
      await new Promise((ok) => setTimeout(ok, 350)); // frena fuerza bruta
      if (!u || u.activo === false || !checkPassword(String(body.password || ""), u)) throw fail(401, "Usuario o contraseña incorrectos");
      return json({ user: pubUser(u) }, 200, setCookie(await sign({ uid: u.id }), 604800));
    }
    if (parts[0] === "logout" && method === "POST") return json({ ok: true }, 200, setCookie("", 0));

    // --- autenticadas ---
    const p = await verify(cookieOf(req, "sid"));
    if (!p) throw fail(401, "Sesión no válida");
    const users = await readKey("users", []);
    const user = users.find((x) => x.id === p.uid);
    if (!user || user.activo === false) throw fail(401, "Sesión no válida");

    if (parts[0] === "password" && method === "POST") {
      if (!checkPassword(String(body.actual || ""), user)) throw fail(400, "La contraseña actual no es correcta");
      if (!body.nueva || String(body.nueva).length < 8) throw fail(400, "La nueva contraseña debe tener al menos 8 caracteres");
      const { salt, hash } = hashPassword(String(body.nueva));
      await mutate("users", (arr) => ({ value: arr.map((x) => (x.id === user.id ? { ...x, salt, hash } : x)), result: true }), []);
      return json({ ok: true });
    }

    if (parts[0] === "settings") {
      if (method === "GET") return json({ ...DEFAULT_SETTINGS, ...(await readKey("settings", {})) });
      if (user.rol !== "admin") throw fail(403, "Solo el administrador");
      const s = { nota_minima: num(body.nota_minima, "Nota mínima"), precio_libro: num(body.precio_libro, "Precio del libro"), nombre_programa: req_(body.nombre_programa, "Nombre") };
      await store().setJSON("settings", s);
      return json(s);
    }

    if (parts[0] === "users") {
      if (user.rol !== "admin") throw fail(403, "Solo el administrador");
      if (method === "GET") return json(users.map(pubUser));
      if (method === "POST") {
        const v = validateUser(body, true);
        const { salt, hash } = hashPassword(String(body.password));
        const nu = await mutate("users", (arr) => {
          if (arr.some((x) => x.usuario === v.usuario)) throw fail(409, "Ese usuario ya existe");
          const r = { id: newId(), ...v, salt, hash };
          return { value: [...arr, r], result: r };
        }, []);
        return json(pubUser(nu), 201);
      }
      const id = parts[1];
      if (method === "PUT") {
        const out = await mutate("users", (arr) => {
          const i = arr.findIndex((x) => x.id === id);
          if (i < 0) throw fail(404, "Usuario no encontrado");
          const v = validateUser({ ...arr[i], ...body }, false);
          if (arr.some((x) => x.usuario === v.usuario && x.id !== id)) throw fail(409, "Ese usuario ya existe");
          let r = { ...arr[i], ...v };
          if (body.password) r = { ...r, ...hashPassword(String(body.password)) };
          const next = arr.map((x, j) => (j === i ? r : x));
          if (!next.some((x) => x.rol === "admin" && x.activo !== false)) throw fail(400, "Debe quedar al menos un administrador activo");
          return { value: next, result: r };
        }, []);
        return json(pubUser(out));
      }
      if (method === "DELETE") {
        if (id === user.id) throw fail(400, "No puedes eliminar tu propio usuario");
        await mutate("users", (arr) => ({ value: arr.filter((x) => x.id !== id), result: true }), []);
        return json({ ok: true });
      }
    }

    if (parts[0] === "comprobantes" && method === "GET") {
      if (!["admin", "tesoreria"].includes(user.rol)) throw fail(403, "Sin permiso");
      return json(await files().list());
    }
    if (isFile) {
      if (!["admin", "tesoreria"].includes(user.rol)) throw fail(403, "Sin permiso");
      const name = decodeURIComponent(parts[1] || "");
      if (!/^[A-Za-z0-9_.-]{3,120}$/.test(name)) throw fail(400, "Nombre de archivo inválido");
      if (method === "GET") {
        const f = await files().get(name);
        if (!f) throw fail(404, "Imagen no encontrada");
        return new Response(f.data, { headers: { "content-type": f.type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
      }
      if (method === "POST") {
        const type = (req.headers.get("content-type") || "").split(";")[0];
        if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) throw fail(400, "Solo imágenes JPG, PNG, WEBP o GIF");
        const buf = Buffer.from(await req.arrayBuffer());
        if (!buf.length) throw fail(400, "Archivo vacío");
        if (buf.length > 5 * 1024 * 1024) throw fail(413, "La imagen supera 5 MB");
        await files().put(name, buf, type);
        return json({ ok: true, name, bytes: buf.length }, 201);
      }
      if (method === "DELETE") {
        if (user.rol !== "admin") throw fail(403, "Solo el administrador");
        await files().del(name); return json({ ok: true });
      }
    }

    // Registro semanal de asistencia y pruebas (Manual del Tutor: A = asistencia, P = pruebas)
    if (parts[0] === "semana" && method === "POST") {
      if (!["admin", "tutor"].includes(user.rol)) throw fail(403, "Sin permiso");
      const semana = Number(body.semana);
      if (!Number.isInteger(semana) || semana < 1 || semana > 12) throw fail(400, "La semana debe ser un número de 1 a 12");
      const grupo = req_(body.grupo, "Grupo");
      const g = (await getCol("grupos")).find((x) => x.id === grupo);
      if (!g) throw fail(400, "El grupo no existe");
      if (user.rol === "tutor" && g.tutor_id !== user.tutor_id) throw fail(403, "Ese grupo no es tuyo");
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length || items.length > 200) throw fail(400, "Sin estudiantes que guardar");
      const cursos = (await getCol("cursos")).filter((c) => c.grupo === grupo);
      const cMap = Object.fromEntries(cursos.map((c) => [c.id, c]));
      const clean = items.map((it) => {
        const c = cMap[it.curso_reg_id]; if (!c) throw fail(400, "Un estudiante no pertenece a este grupo");
        const a = it.a || null, p = it.p || null;
        if (a && !["P", "T", "F"].includes(a)) throw fail(400, "Asistencia inválida (P, T o F)");
        if (p && !["C", "I", "N"].includes(p)) throw fail(400, "Prueba inválida (C, I o N)");
        return { c, a, p };
      });
      const saved = await mutate("col_asistencia", (arr) => {
        const out = [...arr];
        for (const { c, a, p } of clean) {
          let i = out.findIndex((r) => r.curso_reg_id === c.id);
          if (i < 0) { out.push({ id: newId(), curso_reg_id: c.id, estudiante_id: c.estudiante_id, grupo, semanas: {} }); i = out.length - 1; }
          const semanas = { ...out[i].semanas };
          if (a || p) semanas[semana] = { a, p }; else delete semanas[semana];
          out[i] = { ...out[i], semanas };
        }
        return { value: out, result: out.filter((r) => r.grupo === grupo) };
      }, []);
      return json(saved);
    }

    if (parts[0] === "data") {
      const col = parts[1];
      if (!COLS.includes(col)) throw fail(404, "Colección desconocida");
      const perm = PERM[user.rol];
      if (method === "GET") {
        if (!perm.read.includes(col)) throw fail(403, "Sin permiso");
        return json(await listFor(user, col));
      }
      if (col === "asistencia") throw fail(403, "La asistencia se registra por semana desde el módulo Asistencia");
      if (!perm.write.includes(col)) throw fail(403, "Sin permiso para modificar " + col);
      const key = "col_" + col;
      if (col === "grupos") await ensureGrupos();

      // un tutor solo puede tocar notas de sus propios cursos
      const tutorGuard = async (cursoId) => {
        if (user.rol !== "tutor") return;
        const sc = await tutorScope(user);
        if (!sc.cursoIds.has(cursoId)) throw fail(403, "Ese curso no pertenece a tus grupos");
      };

      if (method === "POST") {
        const v = await normalize(col, body, null);
        if (col === "notas") await tutorGuard(v.curso_reg_id);
        const rec = await mutate(key, (arr) => {
          let id = v.id;
          if (!id) {
            if (col === "estudiantes") {
              const mx = Math.max(0, ...arr.map((e) => Number((e.id.match(/(\d+)$/) || [0, 0])[1])));
              id = "PAN-" + String(mx + 1).padStart(3, "0");
            } else id = newId();
          }
          if (col === "grupos" && !v.id) {
            const base = `${v.anio}${v.curso}-${v.tutor_id.replace("PAN-", "")}-`; let n = 1;
            while (arr.some((x) => x.id === base + n)) n++;
            id = base + n;
          }
          if (arr.some((r) => r.id === id)) throw fail(409, "Ya existe un registro con ese ID");
          if (col === "cursos" && arr.some((c) => c.estudiante_id === v.estudiante_id && c.grupo === v.grupo)) throw fail(409, "El estudiante ya está inscrito en ese grupo");
          if (col === "notas" && arr.some((n) => n.curso_reg_id === v.curso_reg_id)) throw fail(409, "Ese curso ya tiene nota; edítala");
          const r = { ...v, id };
          return { value: [...arr, r], result: r };
        }, []);
        return json(rec, 201);
      }
      const id = decodeURIComponent(parts[2] || "");
      if (method === "PUT") {
        const rec = await mutate(key, async (arr) => {
          const i = arr.findIndex((r) => r.id === id);
          if (i < 0) throw fail(404, "Registro no encontrado");
          if (col === "notas") await tutorGuard(arr[i].curso_reg_id);
          const v = await normalize(col, { ...body, id }, arr[i]);
          if (col === "notas") await tutorGuard(v.curso_reg_id);
          return { value: arr.map((r, j) => (j === i ? v : r)), result: v };
        }, []);
        if (col === "grupos") // el tutor/curso/año del grupo se propagan a sus inscripciones
          await mutate("col_cursos", (arr) => ({ value: arr.map((c) => (c.grupo === id ? { ...c, curso: rec.curso, anio: rec.anio, tutor_id: rec.tutor_id } : c)), result: true }), []);
        return json(rec);
      }
      if (method === "DELETE") {
        await checkDelete(col, id);
        if (col === "cursos") await mutate("col_asistencia", (arr) => ({ value: arr.filter((a) => a.curso_reg_id !== id), result: true }), []);
        await mutate(key, async (arr) => {
          const r = arr.find((x) => x.id === id);
          if (!r) throw fail(404, "Registro no encontrado");
          if (col === "notas") await tutorGuard(r.curso_reg_id);
          return { value: arr.filter((x) => x.id !== id), result: true };
        }, []);
        return json({ ok: true });
      }
    }
    throw fail(404, "Ruta no encontrada");
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    return json({ error: status >= 500 ? "Error interno del servidor" : e.message }, status);
  }
}
