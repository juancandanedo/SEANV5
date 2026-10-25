import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os"; import path from "node:path";
const dir = path.join(os.tmpdir(), "seminarios-test-store");
fs.rmSync(dir, { recursive: true, force: true });
process.env.LOCAL_STORE_DIR = dir;
const { default: h } = await import("../netlify/functions/api.mjs");

const jar = {};
async function call(who, method, path, body) {
  const r = await h(new Request("https://x.test" + path, { method, headers: { "content-type": "application/json", cookie: jar[who] || "" }, body: body ? JSON.stringify(body) : undefined }));
  const sc = r.headers.get("set-cookie"); if (sc) jar[who] = sc.split(";")[0];
  return { s: r.status, d: await r.json() };
}
let n = 0; const ok = (name) => console.log("ok", ++n, name);

let r = await call("a", "GET", "/api/session"); assert.equal(r.d.needsSetup, true); ok("needs setup");
r = await call("a", "GET", "/api/data/cobros"); assert.equal(r.s, 401); ok("401 sin sesión");
r = await call("a", "POST", "/api/setup", { usuario: "juancarlos", nombre: "JC", password: "corta" }); assert.equal(r.s, 400); ok("password corta");
r = await call("a", "POST", "/api/setup", { usuario: "juancarlos", nombre: "Juan Carlos", password: "clave12345" }); assert.equal(r.s, 200); ok("setup + seed");
r = await call("z", "POST", "/api/setup", { usuario: "x", nombre: "x", password: "clave12345" }); assert.equal(r.s, 403); ok("setup solo una vez");
r = await call("a", "GET", "/api/data/cobros"); assert.equal(r.d.length, 765); ok("765 cobros");
r = await call("a", "GET", "/api/data/notas"); assert.equal(r.d.length, 72);
r = await call("a", "GET", "/api/data/estudiantes"); assert.equal(r.d.length, 62); ok("seed completo");

// crear usuarios
r = await call("a", "POST", "/api/users", { usuario: "tes", nombre: "Tesorería", rol: "tesoreria", password: "tesoreria1" }); assert.equal(r.s, 201);
r = await call("a", "POST", "/api/users", { usuario: "tutor106", nombre: "Magaly", rol: "tutor", tutor_id: "PAN-106", password: "tutor12345" }); assert.equal(r.s, 201);
r = await call("a", "POST", "/api/users", { usuario: "tutorx", nombre: "x", rol: "tutor", password: "tutor12345" }); assert.equal(r.s, 400);
ok("usuarios");
r = await call("t", "POST", "/api/login", { usuario: "tes", password: "mala" }); assert.equal(r.s, 401);
r = await call("t", "POST", "/api/login", { usuario: "tes", password: "tesoreria1" }); assert.equal(r.s, 200); ok("login tesorería");
r = await call("t", "GET", "/api/data/notas"); assert.equal(r.s, 403); ok("tesorería no ve notas");
r = await call("t", "GET", "/api/users"); assert.equal(r.s, 403);
r = await call("t", "POST", "/api/data/cobros", { fecha: "2026-10-24", estudiante_id: "PAN-001", libro: 6, nivel_id: "f401b8bd", debe: 25 }); assert.equal(r.s, 201); const cid = r.d.id;
r = await call("t", "POST", "/api/data/cobros", { fecha: "2026-10-24", estudiante_id: "PAN-001", nivel_id: "f401b8bd", pago: 10 }); assert.equal(r.s, 400); // sin tipo
r = await call("t", "POST", "/api/data/cobros", { fecha: "2026-10-24", estudiante_id: "PAN-001", nivel_id: "f401b8bd", pago: 10, tipo_pago: "EF-Iglesia" }); assert.equal(r.s, 201); assert.equal(r.d.libro, 6);
r = await call("t", "PUT", "/api/data/cobros/" + cid, { debe: 30 }); assert.equal(r.d.debe, 30);
r = await call("t", "DELETE", "/api/data/cobros/" + cid); assert.equal(r.s, 200); ok("CRUD cobros tesorería");
r = await call("t", "POST", "/api/data/estudiantes", { nombre: "x" }); assert.equal(r.s, 403); ok("tesorería no edita estudiantes");

// tutor
r = await call("u", "POST", "/api/login", { usuario: "tutor106", password: "tutor12345" }); assert.equal(r.s, 200);
const mine = (await call("u", "GET", "/api/data/cursos")).d; assert(mine.length > 0 && mine.every((c) => c.tutor_id === "PAN-106"));
const ests = (await call("u", "GET", "/api/data/estudiantes")).d; assert(ests.length < 62 && ests.length > 0);
const ns = (await call("u", "GET", "/api/data/notas")).d; const ids = new Set(mine.map((c) => c.id)); assert(ns.every((x) => ids.has(x.curso_reg_id)));
r = await call("u", "GET", "/api/data/cobros"); assert.equal(r.s, 403); ok("tutor: alcance y sin cobros");
const free = mine.find((c) => !ns.some((x) => x.curso_reg_id === c.id));
r = await call("u", "POST", "/api/data/notas", { curso_reg_id: free.id, nota: 90, total: 100, modalidad: "VIRTUAL" }); assert.equal(r.s, 201); assert.equal(r.d.estudiante_id, free.estudiante_id);
const nid = r.d.id;
r = await call("u", "POST", "/api/data/notas", { curso_reg_id: free.id, nota: 80, total: 100 }); assert.equal(r.s, 409);
r = await call("u", "PUT", "/api/data/notas/" + nid, { nota: 150 }); assert.equal(r.s, 400);
r = await call("u", "PUT", "/api/data/notas/" + nid, { nota: 95 }); assert.equal(r.d.nota, 95);
const other = (await call("a", "GET", "/api/data/cursos")).d.find((c) => c.tutor_id !== "PAN-106");
r = await call("u", "POST", "/api/data/notas", { curso_reg_id: other.id, nota: 90, total: 100 }); assert.equal(r.s, 403); ok("tutor limitado a sus grupos");
r = await call("u", "DELETE", "/api/data/notas/" + nid); assert.equal(r.s, 200);

// admin integridad
r = await call("a", "DELETE", "/api/data/estudiantes/PAN-001"); assert.equal(r.s, 409); ok("integridad referencial");
r = await call("a", "POST", "/api/data/estudiantes", { nombre: "Nuevo Estudiante", sede: "PANAMA" }); assert.equal(r.d.id, "PAN-064"); ok("ID autogenerado");
r = await call("a", "POST", "/api/data/cursos", { estudiante_id: "PAN-064", grupo: "malformato" }); assert.equal(r.s, 400);
r = await call("a", "PUT", "/api/settings", { nota_minima: 75, precio_libro: 25, nombre_programa: "Seminarios" }); assert.equal(r.d.nota_minima, 75);
r = await call("a", "POST", "/api/password", { actual: "clave12345", nueva: "otraclave99" }); assert.equal(r.s, 200);
r = await call("b", "POST", "/api/login", { usuario: "juancarlos", password: "otraclave99" }); assert.equal(r.s, 200); ok("cambio de contraseña");
// concurrencia
const res = await Promise.all(Array.from({ length: 12 }, (_, i) => call("a", "POST", "/api/data/cobros", { fecha: "2026-10-24", estudiante_id: "PAN-002", libro: 1, debe: i + 1 })));
assert(res.every((x) => x.s === 201)); const all = (await call("a", "GET", "/api/data/cobros")).d; assert.equal(all.filter((c) => c.fecha === "2026-10-24" && c.estudiante_id === "PAN-002").length, 12); ok("12 escrituras concurrentes sin pérdida");
r = await call("a", "POST", "/api/logout"); r = await call("a", "GET", "/api/session"); assert.equal(r.d.user, null); ok("logout");
// comprobantes
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const up = (who, name, type = "image/png", body = png) => h(new Request("https://x.test/api/comprobante/" + name, { method: "POST", headers: { "content-type": type, cookie: jar[who] || "" }, body }));
await call("a", "POST", "/api/login", { usuario: "juancarlos", password: "otraclave99" });
let rr = await up("a", "abc123.IMAGEN.1.jpg"); assert.equal(rr.status, 201);
rr = await up("a", "mal.txt", "text/html", Buffer.from("<script>")); assert.equal(rr.status, 400);
rr = await up("a", "../x.png"); assert([400, 404].includes(rr.status));
rr = await up("u", "tutor.png"); assert.equal(rr.status, 403);
rr = await up("a", "grande.png", "image/png", Buffer.alloc(5 * 1024 * 1024 + 1)); assert.equal(rr.status, 413);
rr = await h(new Request("https://x.test/api/comprobante/abc123.IMAGEN.1.jpg", { headers: { cookie: jar.t } })); assert.equal(rr.status, 200); assert.equal(rr.headers.get("content-type"), "image/png"); assert.equal(Buffer.from(await rr.arrayBuffer()).length, png.length);
rr = await h(new Request("https://x.test/api/comprobante/abc123.IMAGEN.1.jpg", { headers: { cookie: jar.u } })); assert.equal(rr.status, 403);
rr = await h(new Request("https://x.test/api/comprobante/abc123.IMAGEN.1.jpg")); assert.equal(rr.status, 401);
r = await call("t", "GET", "/api/comprobantes"); assert.deepEqual(r.d, ["abc123.IMAGEN.1.jpg"]);
rr = await h(new Request("https://x.test/api/comprobante/abc123.IMAGEN.1.jpg", { method: "DELETE", headers: { cookie: jar.t } })); assert.equal(rr.status, 403);
rr = await h(new Request("https://x.test/api/comprobante/abc123.IMAGEN.1.jpg", { method: "DELETE", headers: { cookie: jar.a } })); assert.equal(rr.status, 200); ok("comprobantes: subir/ver/listar/permisos");
console.log("TODO OK");
