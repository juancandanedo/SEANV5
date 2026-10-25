import { S, esc, $, $$, api, col, cols, idx, invalidate, money, fdate, today, pct, norm, libroLabel, can, toast, modal, formModal, confirmBox, table, bindTables, exportXlsx, imgName, imgUrl, newImgName, compressImage, uploadImage, saldoPorEstudiante, saldoPill, notaPct, aprobado, resultPill } from "./lib.js";

const head = (title, sub = "", actions = "") => `<div class="head"><div><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><div class="actions">${actions}</div></div>`;
const kpi = (l, v, n = "") => `<div class="card kpi"><div class="l">${esc(l)}</div><div class="v">${v}</div><div class="n">${n}</div></div>`;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesLabel = (ym) => MESES[+ym.slice(5) - 1] + " " + ym.slice(2, 4);
const sum = (arr, f) => Math.round(arr.reduce((a, x) => a + f(x), 0) * 100) / 100;
const bars = (items, fmt = money) => { const mx = Math.max(1, ...items.map((i) => i.v)); return `<div class="bars">${items.map((i) => `<div class="bar"><span>${esc(i.l)}</span><div class="t"><i style="width:${(i.v / mx) * 100}%"></i></div><b class="num">${fmt(i.v)}</b></div>`).join("")}</div>`; };
const opts = (rows, v, t) => rows.map((r) => ({ v: v(r), t: t(r) }));

/* ======================= DASHBOARD ======================= */
export async function dashboard(root) {
  root.innerHTML = head(`Hola, ${S.user.nombre.split(" ")[0]}`, esc(S.settings.nombre_programa));
  let html = "";
  if (can("admin", "tesoreria")) {
    const { cobros, estudiantes } = await cols("cobros", "estudiantes");
    const sal = saldoPorEstudiante(cobros), eMap = idx(estudiantes);
    const morosos = Object.entries(sal).filter(([, s]) => s.saldo > 0.004).sort((a, b) => b[1].saldo - a[1].saldo);
    const cargado = sum(cobros, (c) => c.debe), cobrado = sum(cobros, (c) => c.pago);
    html += `<div class="cards">${kpi("Cobrado", money(cobrado), `${cobros.filter((c) => c.pago > 0).length} pagos`)}${kpi("Cargado", money(cargado), "total de cargos")}${kpi("Por cobrar", money(sum(morosos, ([, s]) => s.saldo)), `${morosos.length} estudiantes con saldo`)}${kpi("Estudiantes", estudiantes.length, "registrados")}</div>`;
    const porMes = {}; cobros.filter((c) => c.pago > 0).forEach((c) => { const k = c.fecha.slice(0, 7); porMes[k] = (porMes[k] || 0) + c.pago; });
    const meses = Object.keys(porMes).sort().slice(-8).map((k) => ({ l: mesLabel(k), v: Math.round(porMes[k] * 100) / 100 }));
    html += `<div class="grid2"><div class="card"><h2 style="margin-bottom:.8rem">Cobrado por mes</h2>${meses.length ? bars(meses) : '<div class="empty">Sin pagos</div>'}</div>
      <div class="card"><h2 style="margin-bottom:.6rem">Mayores saldos pendientes</h2>${morosos.slice(0, 7).map(([id, s]) => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--line)"><a href="#/estudiantes/${esc(id)}">${esc(eMap[id]?.nombre || id)}</a><span class="pos">${money(s.saldo)}</span></div>`).join("") || '<div class="empty">Nadie debe 🎉</div>'}</div></div>`;
  }
  if (can("admin", "tutor")) {
    const { notas, cursos } = await cols("notas", "cursos");
    const prom = notas.length ? notas.reduce((a, n) => a + notaPct(n), 0) / notas.length : 0;
    const apr = notas.filter(aprobado).length;
    const sinNota = cursos.filter((c) => !notas.some((n) => n.curso_reg_id === c.id)).length;
    html += `<div class="cards">${kpi("Grupos", new Set(cursos.map((c) => c.grupo)).size, can("tutor") ? "tuyos" : "en total")}${kpi("Notas registradas", notas.length, `${sinNota} inscripciones sin nota`)}${kpi("Promedio", pct(prom), `mínimo para aprobar: ${S.settings.nota_minima}%`)}${kpi("Aprobados", notas.length ? pct(apr / notas.length) : "—", `${apr} de ${notas.length}`)}</div>`;
  }
  root.insertAdjacentHTML("beforeend", html);
}

/* ======================= ESTUDIANTES ======================= */
export async function estudiantes(root, param) {
  const withMoney = can("admin", "tesoreria");
  const data = await cols("estudiantes", ...(withMoney ? ["cobros"] : []));
  const f = { q: "", sede: "" };
  const sedes = [...new Set(data.estudiantes.map((e) => e.sede).filter(Boolean))].sort();
  const sal = withMoney ? saldoPorEstudiante(data.cobros) : {};
  const render = () => {
    const rows = data.estudiantes.filter((e) => (!f.q || norm(e.id + " " + e.nombre + " " + (e.email || "")).includes(norm(f.q))) && (!f.sede || e.sede === f.sede));
    const cs = [
      { k: "id", t: "ID" }, { k: "nombre", t: "Nombre", render: (e) => `<a href="#/estudiantes/${esc(e.id)}">${esc(e.nombre)}</a>` },
      { k: "sede", t: "Sede" }, { k: "telefono", t: "Teléfono" }, { k: "email", t: "Email" },
      ...(withMoney ? [{ k: "saldo", t: "Saldo", num: true, sort: (e) => sal[e.id]?.saldo ?? 0, render: (e) => saldoPill(sal[e.id]?.saldo ?? 0) }] : []),
      { k: "_", t: "", nosort: true, render: (e) => `<button class="btn sm" data-ficha="${esc(e.id)}">Ficha</button>${can("admin") ? ` <button class="btn sm" data-edit="${esc(e.id)}">Editar</button> <button class="btn sm danger" data-del="${esc(e.id)}">✕</button>` : ""}` },
    ];
    $("#tbl", root).innerHTML = table("est", cs, rows, { defaultSort: { k: "id", dir: 1 } });
  };
  root.innerHTML = head("Estudiantes", `${data.estudiantes.length} registrados`, can("admin") ? `<button class="btn primary" id="new">+ Nuevo estudiante</button>` : "") +
    `<div class="filters"><input class="grow" id="q" placeholder="Buscar por nombre, ID o email…"><select id="sede"><option value="">Todas las sedes</option>${sedes.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div><div id="tbl"></div>`;
  render();
  $("#q", root).oninput = (e) => { f.q = e.target.value; render(); };
  $("#sede", root).onchange = (e) => { f.sede = e.target.value; render(); };
  bindTables(root, render);
  const form = (e) => formModal({
    title: e ? "Editar estudiante" : "Nuevo estudiante", values: e || {}, wide: false,
    fields: [{ name: "nombre", label: "Nombre completo", required: true }, { name: "sede", label: "Sede", type: "select", options: opts(sedes, (s) => s, (s) => s) }, { name: "telefono", label: "Teléfono", type: "tel" }, { name: "email", label: "Email", type: "email" }],
    onSubmit: async (d, m) => { e ? await api("data/estudiantes/" + e.id, "PUT", d) : await api("data/estudiantes", "POST", d); invalidate("estudiantes"); m.close(); toast("Guardado"); await estudiantes(root); },
  });
  root.onclick = async (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.id === "new") form();
    if (b.dataset.ficha) ficha(b.dataset.ficha);
    if (b.dataset.edit) form(data.estudiantes.find((x) => x.id === b.dataset.edit));
    if (b.dataset.del) { const e = data.estudiantes.find((x) => x.id === b.dataset.del); confirmBox(`¿Eliminar a ${e.nombre}?`, async () => { await api("data/estudiantes/" + e.id, "DELETE"); invalidate("estudiantes"); toast("Eliminado"); await estudiantes(root); }); }
  };
  if (param) ficha(param);
}

async function ficha(id) {
  const need = ["estudiantes", "cursos", "niveles", "tutores", ...(can("admin", "tesoreria") ? ["cobros"] : []), ...(can("admin", "tutor") ? ["notas"] : [])];
  const d = await cols(...need);
  const e = d.estudiantes.find((x) => x.id === id); if (!e) return toast("Estudiante no encontrado", true);
  const nMap = idx(d.niveles), tMap = idx(d.tutores);
  let html = `<div class="cards"><div class="card"><b>${esc(e.nombre)}</b><div class="sub" style="color:var(--muted)">${esc(e.id)} · ${esc(e.sede || "sin sede")}</div><div>${esc(e.telefono || "")} ${e.email ? "· " + esc(e.email) : ""}</div></div>`;
  if (d.cobros) {
    const mine = d.cobros.filter((c) => c.estudiante_id === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const s = saldoPorEstudiante(mine)[id] || { debe: 0, pago: 0, saldo: 0 };
    html += `<div class="card kpi"><div class="l">Estado de cuenta</div><div class="v">${money(s.saldo)}</div><div class="n">cargado ${money(s.debe)} · pagado ${money(s.pago)}</div></div></div>
      <h3 style="margin:.6rem 0">Movimientos</h3>${table("ficha-cob", [{ k: "fecha", t: "Fecha", render: (c) => fdate(c.fecha) }, { k: "libro", t: "Libro", render: (c) => (nMap[c.nivel_id] ? `L${c.libro} · ${esc(nMap[c.nivel_id].nombre)}` : c.libro ? "L" + c.libro : "") }, { k: "debe", t: "Cargo", num: true, render: (c) => (c.debe ? money(c.debe) : "") }, { k: "pago", t: "Pago", num: true, render: (c) => (c.pago ? money(c.pago) : "") }, { k: "tipo_pago", t: "Tipo" }, { k: "notas", t: "Notas" }], mine, { pageSize: 500 })}`;
  } else html += "</div>";
  const cur = d.cursos.filter((c) => c.estudiante_id === id).sort((a, b) => b.anio - a.anio || a.curso.localeCompare(b.curso));
  if (cur.length) {
    const nt = d.notas ? idx(d.notas, "curso_reg_id") : null;
    html += `<h3 style="margin:1rem 0 .6rem">Cursos${nt ? " y notas" : ""}</h3>${table("ficha-cur", [{ k: "anio", t: "Año" }, { k: "curso", t: "Curso" }, { k: "grupo", t: "Grupo" }, { k: "tutor", t: "Tutor", render: (c) => esc(tMap[c.tutor_id]?.nombre || c.tutor_id) }, ...(nt ? [{ k: "n", t: "Nota", num: true, render: (c) => (nt[c.id] ? `${nt[c.id].nota}/${nt[c.id].total} · ${pct(notaPct(nt[c.id]))}` : '<span class="pill mute">pendiente</span>') }, { k: "r", t: "", render: (c) => (nt[c.id] ? resultPill(nt[c.id]) : "") }] : [])], cur, { pageSize: 500 })}`;
  }
  const m = modal("Ficha del estudiante", html + `<div class="actions noprint" style="justify-content:flex-end;margin-top:1rem"><button class="btn" id="prt">Imprimir / PDF</button></div>`, { wide: true, onClose: () => { if (location.hash.startsWith("#/estudiantes/")) history.replaceState(null, "", "#/estudiantes"); } });
  $("#prt", m.el).onclick = () => { document.body.classList.add("printing"); window.print(); };
  window.addEventListener("afterprint", () => document.body.classList.remove("printing"), { once: true });
}

/* ======================= COBROS ======================= */
export async function cobros(root) {
  const d = await cols("cobros", "estudiantes", "niveles", "tipos_pago");
  const eMap = idx(d.estudiantes), nMap = idx(d.niveles);
  const f = { q: "", libro: "", mov: "", tipo: "", desde: "", hasta: "" };
  const filtered = () => d.cobros.filter((c) => (!f.q || norm(c.estudiante_id + " " + (eMap[c.estudiante_id]?.nombre || "") + " " + (c.notas || "")).includes(norm(f.q))) && (!f.libro || String(c.libro) === f.libro) && (!f.mov || (f.mov === "pago" ? c.pago > 0 : c.debe > 0)) && (!f.tipo || c.tipo_pago === f.tipo) && (!f.desde || c.fecha >= f.desde) && (!f.hasta || c.fecha <= f.hasta));
  const render = () => {
    const rows = filtered();
    const cs = [
      { k: "fecha", t: "Fecha", render: (c) => fdate(c.fecha) },
      { k: "est", t: "Estudiante", sort: (c) => eMap[c.estudiante_id]?.nombre || "", render: (c) => `<a href="#/estudiantes/${esc(c.estudiante_id)}">${esc(eMap[c.estudiante_id]?.nombre || c.estudiante_id)}</a>` },
      { k: "libro", t: "Libro", render: (c) => (c.libro ? "L" + c.libro : "") },
      { k: "debe", t: "Cargo", num: true, render: (c) => (c.debe ? money(c.debe) : "") },
      { k: "pago", t: "Pago", num: true, render: (c) => (c.pago ? `<span class="neg">${money(c.pago)}</span>` : "") },
      { k: "tipo_pago", t: "Tipo" }, { k: "notas", t: "Notas", wrap: true },
      { k: "img", t: "Comp.", sort: (c) => (c.imagen ? 1 : 0), render: (c) => (c.imagen ? `<button class="btn sm" data-img="${esc(c.id)}" title="Ver comprobante">📎</button>` : "") },
      { k: "_", t: "", nosort: true, render: (c) => `<button class="btn sm" data-edit="${esc(c.id)}">Editar</button> <button class="btn sm danger" data-del="${esc(c.id)}">✕</button>` },
    ];
    $("#tbl", root).innerHTML = table("cob", cs, rows, { defaultSort: { k: "fecha", dir: -1 }, footer: `Cargos <b>${money(sum(rows, (c) => c.debe))}</b> · Pagos <b>${money(sum(rows, (c) => c.pago))}</b>` });
  };
  root.innerHTML = head("Cobros", "Cargos por libro y pagos recibidos", `<button class="btn" id="exp">Exportar Excel</button><button class="btn" id="imp">Importar comprobantes</button><button class="btn" id="newc">+ Cargo</button><button class="btn primary" id="newp">+ Registrar pago</button>`) +
    `<div class="filters"><input class="grow" id="q" placeholder="Buscar estudiante o nota…"><select id="libro"><option value="">Todos los libros</option>${[...new Set(d.cobros.map((c) => c.libro).filter(Boolean))].sort((a, b) => a - b).map((l) => `<option value="${l}">Libro ${l}</option>`).join("")}</select><select id="mov"><option value="">Cargos y pagos</option><option value="pago">Solo pagos</option><option value="cargo">Solo cargos</option></select><select id="tipo"><option value="">Todo tipo de pago</option>${d.tipos_pago.map((t) => `<option>${esc(t.id)}</option>`).join("")}</select><label class="dl">Desde <input type="date" id="desde"></label><label class="dl">Hasta <input type="date" id="hasta"></label></div><div id="tbl"></div>`;
  render();
  for (const k of ["q", "libro", "mov", "tipo", "desde", "hasta"]) $("#" + k, root).addEventListener(k === "q" ? "input" : "change", (e) => { f[k] = e.target.value; render(); });
  bindTables(root, render);
  const form = (c, tipo = "pago") => {
    const isPago = c ? c.pago > 0 : tipo === "pago";
    formModal({
      title: c ? "Editar movimiento" : isPago ? "Registrar pago" : "Registrar cargo", values: c ? { ...c, tipo: isPago ? "pago" : "cargo", monto: isPago ? c.pago : c.debe } : { tipo, fecha: today(), monto: isPago ? "" : S.settings.precio_libro },
      fields: [
        { name: "tipo", label: "Movimiento", type: "select", blank: false, options: [{ v: "pago", t: "Pago recibido" }, { v: "cargo", t: "Cargo (deuda del libro)" }] },
        { name: "fecha", label: "Fecha", type: "date", required: true },
        { name: "estudiante_id", label: "Estudiante", type: "select", required: true, blank: "Selecciona…", options: opts([...d.estudiantes].sort((a, b) => a.nombre.localeCompare(b.nombre)), (e) => e.id, (e) => `${e.nombre} (${e.id})`) },
        { name: "nivel_id", label: "Libro", type: "select", required: true, blank: "Selecciona…", options: opts([...d.niveles].sort((a, b) => a.nivel - b.nivel || a.libro - b.libro), (n) => n.id, libroLabel) },
        { name: "monto", label: "Monto ($)", type: "number", step: "0.01", min: "0.01", required: true },
        { name: "tipo_pago", label: "Tipo de pago", type: "select", options: opts(d.tipos_pago, (t) => t.id, (t) => `${t.nombre} — ${t.descripcion || ""}`), hint: "Obligatorio si es un pago" },
        { name: "notas", label: "Notas", type: "textarea" },
        { name: "archivo", label: c?.imagen ? "Reemplazar comprobante (foto)" : "Comprobante (foto)", type: "file", accept: "image/*", hint: "Opcional. Foto del recibo o transferencia; se reduce automáticamente." },
      ],
      onSubmit: async (v, m) => {
        let imagen = c?.imagen;
        if (v.archivo && v.archivo.size > 0) {
          const name = newImgName(); await uploadImage(name, await compressImage(v.archivo)); imagen = "ENTRADAS_Images/" + name;
        }
        const body = { fecha: v.fecha, estudiante_id: v.estudiante_id, nivel_id: v.nivel_id, notas: v.notas, tipo_pago: v.tipo_pago, imagen, debe: v.tipo === "cargo" ? v.monto : 0, pago: v.tipo === "pago" ? v.monto : 0 };
        c ? await api("data/cobros/" + c.id, "PUT", body) : await api("data/cobros", "POST", body);
        invalidate("cobros"); m.close(); toast("Movimiento guardado"); await cobros(root);
      },
    });
  };
  $("#newp", root).onclick = () => form(null, "pago");
  $("#imp", root).onclick = () => importer(d.cobros, eMap);
  $("#newc", root).onclick = () => form(null, "cargo");
  $("#exp", root).onclick = () => exportXlsx("cobros", filtered().map((c) => ({ Fecha: c.fecha, ID: c.estudiante_id, Estudiante: eMap[c.estudiante_id]?.nombre, Libro: c.libro, Cargo: c.debe || "", Pago: c.pago || "", "Tipo de pago": c.tipo_pago || "", Notas: c.notas || "" })), "Cobros");
  root.onclick = (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.edit) form(d.cobros.find((x) => x.id === b.dataset.edit));
    if (b.dataset.img) { const c = d.cobros.find((x) => x.id === b.dataset.img); const m = modal(`Comprobante · ${eMap[c.estudiante_id]?.nombre || ""} · ${fdate(c.fecha)}`, `<div style="text-align:center"><img alt="Comprobante" src="${imgUrl(c.imagen)}" style="max-width:100%;max-height:70vh;border-radius:8px"><p class="empty hidden">Esta imagen aún no se ha cargado. Usa «Importar comprobantes».</p></div><p style="color:var(--muted);font-size:.85rem;margin-top:.6rem">${money(c.pago || c.debe)} · ${esc(imgName(c.imagen))}</p>`, { wide: true }); const im = $("img", m.el); im.onerror = () => { im.classList.add("hidden"); $(".empty", m.el).classList.remove("hidden"); }; }
    if (b.dataset.del) { const c = d.cobros.find((x) => x.id === b.dataset.del); confirmBox(`¿Eliminar este movimiento de ${eMap[c.estudiante_id]?.nombre} (${fdate(c.fecha)}, ${money(c.debe || c.pago)})?`, async () => { await api("data/cobros/" + c.id, "DELETE"); invalidate("cobros"); toast("Eliminado"); await cobros(root); }); }
  };
}

/* ======================= NOTAS ======================= */
export async function notas(root) {
  const d = await cols("notas", "cursos", "estudiantes", "tutores");
  const eMap = idx(d.estudiantes), tMap = idx(d.tutores), cMap = idx(d.cursos);
  const grupos = [...new Set(d.cursos.map((c) => c.grupo))].sort().reverse();
  const f = { tab: S.notasTab || "registro", q: "", anio: "", curso: "", res: "", grupo: grupos[0] || "" };
  const reload = async () => { S.notasTab = f.tab; invalidate("notas"); await notas(root); };
  const rowsAll = () => d.notas.map((n) => ({ ...n, c: cMap[n.curso_reg_id] })).filter((n) => n.c);
  const renderReg = () => {
    const rows = rowsAll().filter((n) => (!f.q || norm(eMap[n.estudiante_id]?.nombre + " " + n.c.grupo).includes(norm(f.q))) && (!f.anio || String(n.c.anio) === f.anio) && (!f.curso || n.c.curso === f.curso) && (!f.res || (f.res === "ok") === aprobado(n)));
    const cs = [
      { k: "est", t: "Estudiante", sort: (n) => eMap[n.estudiante_id]?.nombre || "", render: (n) => `<a href="#/estudiantes/${esc(n.estudiante_id)}">${esc(eMap[n.estudiante_id]?.nombre || n.estudiante_id)}</a>` },
      { k: "grupo", t: "Grupo", sort: (n) => n.c.grupo, render: (n) => esc(n.c.grupo) }, { k: "curso", t: "Curso", sort: (n) => n.c.curso, render: (n) => esc(n.c.curso) },
      { k: "nota", t: "Nota", num: true, render: (n) => `${n.nota}/${n.total}` }, { k: "p", t: "%", num: true, sort: notaPct, render: (n) => pct(notaPct(n)) },
      { k: "r", t: "Resultado", sort: aprobado, render: resultPill }, { k: "modalidad", t: "Modalidad" }, { k: "fecha_examen", t: "Fecha examen", render: (n) => fdate(n.fecha_examen) },
      { k: "_", t: "", nosort: true, render: (n) => `<button class="btn sm" data-edit="${esc(n.id)}">Editar</button> <button class="btn sm danger" data-del="${esc(n.id)}">✕</button>` },
    ];
    $("#pane", root).innerHTML = `<div class="filters"><input class="grow" id="q" placeholder="Buscar estudiante o grupo…" value="${esc(f.q)}"><select id="anio"><option value="">Todos los años</option>${[...new Set(d.cursos.map((c) => c.anio))].sort().reverse().map((a) => `<option ${String(a) === f.anio ? "selected" : ""}>${a}</option>`).join("")}</select><select id="curso"><option value="">Todos los cursos</option>${[...new Set(d.cursos.map((c) => c.curso))].sort().map((c) => `<option ${c === f.curso ? "selected" : ""}>${c}</option>`).join("")}</select><select id="res"><option value="">Aprobados y reprobados</option><option value="ok" ${f.res === "ok" ? "selected" : ""}>Aprobados</option><option value="no" ${f.res === "no" ? "selected" : ""}>Reprobados</option></select></div>` +
      table("notas", cs, rows, { defaultSort: { k: "grupo", dir: -1 }, footer: rows.length ? `Promedio <b>${pct(rows.reduce((a, n) => a + notaPct(n), 0) / rows.length)}</b>` : "" });
    const keep = $("#q", root); keep.oninput = (e) => { f.q = e.target.value; const p = e.target.selectionStart; renderReg(); const q = $("#q", root); q.focus(); q.setSelectionRange(p, p); };
    for (const k of ["anio", "curso", "res"]) $("#" + k, root).onchange = (e) => { f[k] = e.target.value; renderReg(); };
  };
  const renderCap = () => {
    const insc = d.cursos.filter((c) => c.grupo === f.grupo).sort((a, b) => (eMap[a.estudiante_id]?.nombre || "").localeCompare(eMap[b.estudiante_id]?.nombre || ""));
    const nByC = idx(d.notas, "curso_reg_id");
    const tut = tMap[insc[0]?.tutor_id];
    $("#pane", root).innerHTML = `<div class="filters"><select id="grupo" style="max-width:420px;flex:2">${grupos.map((g) => { const k = d.cursos.find((c) => c.grupo === g); return `<option value="${esc(g)}" ${g === f.grupo ? "selected" : ""}>${esc(g)} · ${esc(tMap[k.tutor_id]?.nombre || k.tutor_id)}</option>`; }).join("")}</select></div>
      <p class="sub" style="color:var(--muted)">${insc.length} inscritos${tut ? " · Tutor: " + esc(tut.nombre) : ""}. Completa las notas y guarda; solo se envían las filas que cambiaste.</p>
      <div class="tablewrap cap"><table><thead><tr><th class="nosort">Estudiante</th><th class="nosort">Nota</th><th class="nosort">Total puntos</th><th class="nosort">Modalidad</th><th class="nosort">Fecha examen</th><th class="nosort num">%</th></tr></thead><tbody>${insc.map((c) => { const n = nByC[c.id]; return `<tr data-c="${esc(c.id)}"><td>${esc(eMap[c.estudiante_id]?.nombre || c.estudiante_id)}</td><td><input type="number" step="0.01" min="0" name="nota" value="${n ? n.nota : ""}" aria-label="Nota"></td><td><input type="number" step="0.01" min="1" name="total" value="${n ? n.total : 100}" aria-label="Total"></td><td><select name="modalidad"><option value=""></option>${["PRESENCIAL", "VIRTUAL"].map((m) => `<option ${n?.modalidad === m ? "selected" : ""}>${m}</option>`).join("")}</select></td><td><input type="date" name="fecha_examen" value="${esc(n?.fecha_examen || "")}"></td><td class="num pc">${n ? pct(notaPct(n)) : "—"}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="actions" style="justify-content:flex-end;margin-top:.8rem"><button class="btn primary" id="saveAll">Guardar cambios</button></div>`;
    $("#grupo", root).onchange = (e) => { f.grupo = e.target.value; renderCap(); };
    $$("tr[data-c]", root).forEach((tr) => { const upd = () => { tr.dataset.dirty = "1"; const n = parseFloat($("[name=nota]", tr).value), t = parseFloat($("[name=total]", tr).value); $(".pc", tr).textContent = n >= 0 && t > 0 ? pct(n / t) : "—"; }; $$("input,select", tr).forEach((i) => i.addEventListener("input", upd)); });
    $("#saveAll", root).onclick = async (ev) => {
      const dirty = $$("tr[data-dirty]", root).filter((tr) => $("[name=nota]", tr).value !== "");
      if (!dirty.length) return toast("No hay cambios para guardar");
      ev.target.disabled = true; let ok = 0; const errs = [];
      for (const tr of dirty) {
        const cid = tr.dataset.c, body = { curso_reg_id: cid, nota: $("[name=nota]", tr).value, total: $("[name=total]", tr).value, modalidad: $("[name=modalidad]", tr).value, fecha_examen: $("[name=fecha_examen]", tr).value };
        try { const ex = nByC[cid]; ex ? await api("data/notas/" + ex.id, "PUT", body) : await api("data/notas", "POST", body); ok++; } catch (e) { errs.push(`${eMap[cMap[cid].estudiante_id]?.nombre}: ${e.message}`); }
      }
      toast(`${ok} nota(s) guardada(s)` + (errs.length ? ` · ${errs.length} con error` : ""), errs.length > 0);
      if (errs.length) modal("Notas con error", `<ul>${errs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      await reload();
    };
  };
  const render = () => { $$(".tabs button", root).forEach((b) => b.classList.toggle("on", b.dataset.tab === f.tab)); f.tab === "registro" ? renderReg() : renderCap(); };
  root.innerHTML = head("Notas", `Mínimo para aprobar: ${S.settings.nota_minima}%`, `<button class="btn" id="exp">Exportar Excel</button>`) + `<div class="tabs"><button data-tab="registro">Registro de notas</button><button data-tab="captura">Captura por grupo</button></div><div id="pane"></div>`;
  $$(".tabs button", root).forEach((b) => (b.onclick = () => { f.tab = b.dataset.tab; render(); }));
  render(); bindTables(root, () => f.tab === "registro" && renderReg());
  $("#exp", root).onclick = () => exportXlsx("notas", rowsAll().map((n) => ({ Estudiante: eMap[n.estudiante_id]?.nombre, ID: n.estudiante_id, Grupo: n.c.grupo, Curso: n.c.curso, Tutor: tMap[n.c.tutor_id]?.nombre || n.c.tutor_id, Nota: n.nota, Total: n.total, Porcentaje: Math.round(notaPct(n) * 1000) / 10, Resultado: aprobado(n) ? "Aprobado" : "Reprobado", Modalidad: n.modalidad, "Fecha examen": n.fecha_examen })), "Notas");
  root.onclick = (ev) => {
    const b = ev.target.closest("button[data-edit],button[data-del]"); if (!b) return;
    const n = d.notas.find((x) => x.id === (b.dataset.edit || b.dataset.del)); const c = cMap[n.curso_reg_id];
    if (b.dataset.del) return confirmBox(`¿Eliminar la nota de ${eMap[n.estudiante_id]?.nombre} (${c.grupo})?`, async () => { await api("data/notas/" + n.id, "DELETE"); toast("Eliminada"); await reload(); });
    formModal({ title: `${eMap[n.estudiante_id]?.nombre} · ${c.grupo}`, values: n, fields: [{ name: "nota", label: "Nota", type: "number", step: "0.01", min: "0", required: true }, { name: "total", label: "Total de puntos", type: "number", step: "0.01", min: "1", required: true }, { name: "modalidad", label: "Modalidad", type: "select", options: opts(["PRESENCIAL", "VIRTUAL"], (x) => x, (x) => x) }, { name: "fecha_examen", label: "Fecha del examen", type: "date" }], onSubmit: async (v, m) => { await api("data/notas/" + n.id, "PUT", v); m.close(); toast("Nota actualizada"); await reload(); } });
  };
}

/* ======================= CATÁLOGOS (admin) ======================= */
export async function catalogos(root) {
  const d = await cols("tutores", "salones", "niveles", "tipos_pago", "cursos", "estudiantes");
  const eMap = idx(d.estudiantes), tMap = idx(d.tutores);
  const grupos = [...new Set(d.cursos.map((c) => c.grupo))].sort().reverse();
  const CFG = {
    tutores: { title: "Tutores", rows: d.tutores, cols: [{ k: "id", t: "ID" }, { k: "nombre", t: "Nombre" }, { k: "nivel", t: "Nivel" }], fields: (e) => [{ name: "id", label: "ID (ej. PAN-114)", required: true, disabled: !!e }, { name: "nombre", label: "Nombre", required: true }, { name: "nivel", label: "Nivel", type: "number", min: 1, required: true }] },
    salones: { title: "Salones", rows: d.salones, cols: [{ k: "id", t: "ID" }, { k: "ubicacion", t: "Ubicación" }, { k: "sede", t: "Sede" }], fields: (e) => [{ name: "id", label: "ID", required: true, disabled: !!e }, { name: "ubicacion", label: "Ubicación", required: true }, { name: "sede", label: "Sede" }] },
    niveles: { title: "Libros", rows: d.niveles, cols: [{ k: "nivel", t: "Nivel" }, { k: "libro", t: "Libro" }, { k: "nombre", t: "Nombre del libro" }], fields: () => [{ name: "nivel", label: "Nivel", type: "number", min: 1, required: true }, { name: "libro", label: "N.º de libro", type: "number", min: 1, required: true }, { name: "nombre", label: "Nombre del libro", required: true }] },
    tipos_pago: { title: "Tipos de pago", rows: d.tipos_pago, cols: [{ k: "nombre", t: "Código" }, { k: "descripcion", t: "Descripción" }], fields: (e) => [{ name: "nombre", label: "Código", required: true, disabled: !!e }, { name: "descripcion", label: "Descripción" }] },
    cursos: { title: "Inscripciones", rows: d.cursos, cols: [{ k: "anio", t: "Año" }, { k: "grupo", t: "Grupo" }, { k: "curso", t: "Curso" }, { k: "est", t: "Estudiante", sort: (c) => eMap[c.estudiante_id]?.nombre || "", render: (c) => esc(eMap[c.estudiante_id]?.nombre || c.estudiante_id) }, { k: "tutor", t: "Tutor", sort: (c) => tMap[c.tutor_id]?.nombre || c.tutor_id, render: (c) => esc(tMap[c.tutor_id]?.nombre || c.tutor_id) }],
      fields: (e) => [{ name: "estudiante_id", label: "Estudiante", type: "select", required: true, blank: "Selecciona…", options: opts([...d.estudiantes].sort((a, b) => a.nombre.localeCompare(b.nombre)), (x) => x.id, (x) => `${x.nombre} (${x.id})`) }, { name: "grupo_sel", label: "Grupo existente", type: "select", blank: "— crear uno nuevo —", options: opts(grupos, (g) => g, (g) => g) }, { name: "grupo", label: "…o grupo nuevo", hint: "Formato AAAA + N#L# - ID tutor - n (ej. 2026N2L4-106-1)" }] },
  };
  const f = { tab: "tutores" };
  const render = () => {
    const c = CFG[f.tab];
    $$(".tabs button", root).forEach((b) => b.classList.toggle("on", b.dataset.tab === f.tab));
    const cs = [...c.cols, { k: "_", t: "", nosort: true, render: (r) => `<button class="btn sm" data-edit="${esc(r.id)}">Editar</button> <button class="btn sm danger" data-del="${esc(r.id)}">✕</button>` }];
    $("#pane", root).innerHTML = `<div class="actions" style="margin-bottom:.8rem"><button class="btn primary" id="add">+ Agregar</button></div>` + table("cat-" + f.tab, cs, c.rows, { pageSize: 60 });
  };
  root.innerHTML = head("Catálogos", "Datos maestros del programa") + `<div class="tabs">${Object.entries(CFG).map(([k, v]) => `<button data-tab="${k}">${v.title}</button>`).join("")}</div><div id="pane"></div>`;
  $$(".tabs button", root).forEach((b) => (b.onclick = () => { f.tab = b.dataset.tab; render(); }));
  render(); bindTables(root, render);
  const edit = (rec) => {
    const c = CFG[f.tab], isNew = !rec;
    formModal({ title: (isNew ? "Agregar · " : "Editar · ") + c.title, values: rec || {}, fields: c.fields(rec),
      onSubmit: async (v, m) => {
        let body = { ...v };
        if (f.tab === "cursos") { body = { estudiante_id: v.estudiante_id, grupo: v.grupo_sel || v.grupo }; if (rec) body.id = rec.id; }
        if (f.tab === "tipos_pago" && isNew) body.id = v.nombre;
        isNew ? await api("data/" + f.tab, "POST", body) : await api(`data/${f.tab}/${encodeURIComponent(rec.id)}`, "PUT", body);
        invalidate(f.tab); m.close(); toast("Guardado"); const t = f.tab; await catalogos(root); f.tab = t; $(`.tabs button[data-tab=${t}]`, root).click();
      } });
  };
  root.onclick = (ev) => {
    const b = ev.target.closest("button"); if (!b) return; const c = CFG[f.tab];
    if (b.id === "add") edit();
    if (b.dataset.edit) edit(c.rows.find((r) => r.id === b.dataset.edit));
    if (b.dataset.del) confirmBox("¿Eliminar este registro?", async () => { await api(`data/${f.tab}/${encodeURIComponent(b.dataset.del)}`, "DELETE"); invalidate(f.tab); toast("Eliminado"); const t = f.tab; await catalogos(root); $(`.tabs button[data-tab=${t}]`, root).click(); });
  };
}

/* ======================= REPORTES ======================= */
export async function reportes(root) {
  const tabs = [...(can("admin", "tesoreria") ? [["morosos", "Morosos"], ["ingresos", "Ingresos"]] : []), ...(can("admin", "tutor") ? [["notas", "Notas por grupo"]] : [])];
  const f = { tab: tabs[0][0] };
  const draw = async () => {
    $$(".tabs button", root).forEach((b) => b.classList.toggle("on", b.dataset.tab === f.tab));
    const pane = $("#pane", root);
    if (f.tab === "morosos") {
      const { cobros, estudiantes } = await cols("cobros", "estudiantes");
      const sal = saldoPorEstudiante(cobros);
      const rows = estudiantes.filter((e) => sal[e.id]?.saldo > 0.004).map((e) => ({ e, ...sal[e.id] })).sort((a, b) => b.saldo - a.saldo);
      const wa = (e, saldo) => { const t = (e.telefono || "").replace(/\D/g, ""); if (t.length !== 8 || !["PANAMA", "VACAMONTE", "TUTOR"].includes(e.sede)) return ""; return ` <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/507${t}?text=${encodeURIComponent(`Hola ${e.nombre.split(" ")[0]}, te escribimos de ${S.settings.nombre_programa}. Tu saldo pendiente es de ${money(saldo)}. ¡Gracias!`)}">WhatsApp</a>`; };
      pane.innerHTML = `<div class="actions" style="margin-bottom:.8rem"><button class="btn" id="exp">Exportar Excel</button></div>` + table("morosos", [{ k: "id", t: "ID", sort: (r) => r.e.id, render: (r) => esc(r.e.id) }, { k: "n", t: "Estudiante", sort: (r) => r.e.nombre, render: (r) => `<a href="#/estudiantes/${esc(r.e.id)}">${esc(r.e.nombre)}</a>` }, { k: "sede", t: "Sede", sort: (r) => r.e.sede || "", render: (r) => esc(r.e.sede || "") }, { k: "debe", t: "Cargado", num: true, render: (r) => money(r.debe) }, { k: "pago", t: "Pagado", num: true, render: (r) => money(r.pago) }, { k: "saldo", t: "Saldo", num: true, render: (r) => `<span class="pos">${money(r.saldo)}</span>` }, { k: "up", t: "Último pago", sort: (r) => r.ultimoPago || "", render: (r) => fdate(r.ultimoPago) || "—" }, { k: "_", t: "", nosort: true, render: (r) => wa(r.e, r.saldo) }], rows, { defaultSort: { k: "saldo", dir: -1 }, footer: `Total por cobrar <b>${money(sum(rows, (r) => r.saldo))}</b>`, empty: "Nadie tiene saldo pendiente" });
      $("#exp", root).onclick = () => exportXlsx("morosos", rows.map((r) => ({ ID: r.e.id, Estudiante: r.e.nombre, Sede: r.e.sede, Teléfono: r.e.telefono, Email: r.e.email, Cargado: r.debe, Pagado: r.pago, Saldo: r.saldo, "Último pago": r.ultimoPago })), "Morosos");
    } else if (f.tab === "ingresos") {
      const { cobros, niveles } = await cols("cobros", "niveles");
      const m = {}; cobros.forEach((c) => { const k = c.fecha.slice(0, 7); const x = (m[k] ||= { mes: k, pagos: 0, n: 0, cargos: 0 }); x.pagos += c.pago || 0; x.cargos += c.debe || 0; if (c.pago > 0) x.n++; });
      const meses = Object.values(m).sort((a, b) => b.mes.localeCompare(a.mes)).map((x) => ({ ...x, pagos: Math.round(x.pagos * 100) / 100, cargos: Math.round(x.cargos * 100) / 100 }));
      const tipos = {}; cobros.filter((c) => c.pago > 0).forEach((c) => (tipos[c.tipo_pago || "—"] = (tipos[c.tipo_pago || "—"] || 0) + c.pago));
      const nMap = idx(niveles); const libros = {}; cobros.forEach((c) => { const k = c.libro || 0; const x = (libros[k] ||= { libro: k, debe: 0, pago: 0 }); x.debe += c.debe || 0; x.pago += c.pago || 0; });
      pane.innerHTML = `<div class="actions" style="margin-bottom:.8rem"><button class="btn" id="exp">Exportar Excel</button></div><div class="grid2"><div class="card"><h2 style="margin-bottom:.7rem">Por tipo de pago</h2>${bars(Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v: Math.round(v * 100) / 100 })))}</div><div class="card"><h2 style="margin-bottom:.7rem">Por libro (cobrado / cargado)</h2>${Object.values(libros).sort((a, b) => a.libro - b.libro).map((x) => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--line)"><span>Libro ${x.libro || "?"}</span><span>${money(x.pago)} / ${money(x.debe)} · <span class="${x.debe - x.pago > 0.004 ? "pos" : "neg"}">${money(x.debe - x.pago)}</span></span></div>`).join("")}</div></div>` +
        table("ingresos", [{ k: "mes", t: "Mes", render: (r) => mesLabel(r.mes) }, { k: "n", t: "N.º pagos", num: true }, { k: "pagos", t: "Cobrado", num: true, render: (r) => money(r.pagos) }, { k: "cargos", t: "Cargado", num: true, render: (r) => money(r.cargos) }], meses, { defaultSort: { k: "mes", dir: -1 } });
      $("#exp", root).onclick = () => exportXlsx("ingresos_por_mes", meses.map((r) => ({ Mes: r.mes, "N.º pagos": r.n, Cobrado: r.pagos, Cargado: r.cargos })), "Ingresos");
    } else {
      const { notas, cursos, tutores, estudiantes } = await cols("notas", "cursos", "tutores", "estudiantes");
      const tMap = idx(tutores), nByC = idx(notas, "curso_reg_id");
      const g = {}; cursos.forEach((c) => { const x = (g[c.grupo] ||= { grupo: c.grupo, tutor: tMap[c.tutor_id]?.nombre || c.tutor_id, insc: 0, con: [] }); x.insc++; const n = nByC[c.id]; if (n) x.con.push(n); });
      const rows = Object.values(g).map((x) => ({ ...x, prom: x.con.length ? x.con.reduce((a, n) => a + notaPct(n), 0) / x.con.length : null, apr: x.con.filter(aprobado).length })).sort((a, b) => b.grupo.localeCompare(a.grupo));
      pane.innerHTML = `<div class="actions" style="margin-bottom:.8rem"><button class="btn" id="exp">Exportar Excel</button></div>` + table("rep-notas", [{ k: "grupo", t: "Grupo" }, { k: "tutor", t: "Tutor" }, { k: "insc", t: "Inscritos", num: true }, { k: "n", t: "Con nota", num: true, sort: (r) => r.con.length, render: (r) => r.con.length }, { k: "prom", t: "Promedio", num: true, render: (r) => (r.prom == null ? "—" : pct(r.prom)) }, { k: "apr", t: "Aprobados", num: true, render: (r) => (r.con.length ? `${r.apr} (${pct(r.apr / r.con.length)})` : "—") }], rows, { defaultSort: { k: "grupo", dir: -1 }, pageSize: 200 });
      $("#exp", root).onclick = () => exportXlsx("notas_por_grupo", rows.map((r) => ({ Grupo: r.grupo, Tutor: r.tutor, Inscritos: r.insc, "Con nota": r.con.length, "Promedio %": r.prom == null ? "" : Math.round(r.prom * 1000) / 10, Aprobados: r.apr })), "Notas por grupo");
    }
  };
  root.innerHTML = head("Reportes") + `<div class="tabs">${tabs.map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join("")}</div><div id="pane"></div>`;
  $$(".tabs button", root).forEach((b) => (b.onclick = () => { f.tab = b.dataset.tab; draw(); }));
  bindTables(root, draw); draw();
}

/* ======================= USUARIOS Y AJUSTES (admin) ======================= */
export async function usuarios(root) {
  const [users, tutores] = await Promise.all([api("users"), col("tutores")]);
  const ROL = { admin: "Administrador", tesoreria: "Tesorería", tutor: "Tutor" };
  const render = () => {
    $("#tbl", root).innerHTML = table("usr", [{ k: "usuario", t: "Usuario" }, { k: "nombre", t: "Nombre" }, { k: "rol", t: "Rol", render: (u) => `<span class="pill ${u.rol === "admin" ? "warn" : "mute"}">${ROL[u.rol]}</span>` }, { k: "tutor_id", t: "Tutor vinculado", render: (u) => esc(tutores.find((t) => t.id === u.tutor_id)?.nombre || "") }, { k: "activo", t: "Estado", render: (u) => (u.activo ? '<span class="pill ok">Activo</span>' : '<span class="pill bad">Inactivo</span>') }, { k: "_", t: "", nosort: true, render: (u) => `<button class="btn sm" data-edit="${esc(u.id)}">Editar</button> ${u.id !== S.user.id ? `<button class="btn sm danger" data-del="${esc(u.id)}">✕</button>` : ""}` }], users);
  };
  root.innerHTML = head("Usuarios y ajustes", "Quién entra a la aplicación y qué puede hacer", `<button class="btn" id="cfg">Ajustes del programa</button><button class="btn primary" id="new">+ Nuevo usuario</button>`) +
    `<div class="card" style="margin-bottom:1rem"><b>Permisos por rol</b><ul style="margin:.5rem 0 0;padding-left:1.2rem;color:var(--muted)"><li><b>Administrador:</b> todo, incluidos catálogos y usuarios.</li><li><b>Tesorería:</b> cobros, estado de cuenta y reportes de ingresos/morosos. No ve notas.</li><li><b>Tutor:</b> solo los grupos donde él es tutor; captura y consulta notas. No ve cobros.</li></ul></div><div id="tbl"></div>`;
  render(); bindTables(root, render);
  const form = (u) => formModal({
    title: u ? "Editar usuario" : "Nuevo usuario", values: u ? { ...u, activo: u.activo ? "1" : "0" } : { rol: "tutor", activo: "1" },
    fields: [{ name: "usuario", label: "Usuario", required: true, autocomplete: "off" }, { name: "nombre", label: "Nombre", required: true }, { name: "rol", label: "Rol", type: "select", blank: false, options: Object.entries(ROL).map(([v, t]) => ({ v, t })) }, { name: "tutor_id", label: "Tutor vinculado (solo rol Tutor)", type: "select", options: opts(tutores, (t) => t.id, (t) => `${t.nombre} (${t.id})`) }, { name: "password", label: u ? "Nueva contraseña (opcional)" : "Contraseña", type: "password", required: !u, autocomplete: "new-password", hint: "Mínimo 8 caracteres" }, { name: "activo", label: "Estado", type: "select", blank: false, options: [{ v: "1", t: "Activo" }, { v: "0", t: "Inactivo" }] }],
    onSubmit: async (v, m) => { const body = { ...v, activo: v.activo === "1" }; if (!body.password) delete body.password; u ? await api("users/" + u.id, "PUT", body) : await api("users", "POST", body); m.close(); toast("Usuario guardado"); await usuarios(root); },
  });
  root.onclick = (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.id === "new") form();
    if (b.dataset.edit) form(users.find((x) => x.id === b.dataset.edit));
    if (b.dataset.del) confirmBox("¿Eliminar este usuario?", async () => { await api("users/" + b.dataset.del, "DELETE"); toast("Eliminado"); await usuarios(root); });
    if (b.id === "cfg") formModal({ title: "Ajustes del programa", values: S.settings, fields: [{ name: "nombre_programa", label: "Nombre del programa", required: true }, { name: "nota_minima", label: "Nota mínima para aprobar (%)", type: "number", min: 0, max: 100, step: "0.1", required: true }, { name: "precio_libro", label: "Precio estándar por libro ($)", type: "number", min: 0, step: "0.01", required: true }], onSubmit: async (v, m) => { S.settings = await api("settings", "PUT", v); m.close(); toast("Ajustes guardados"); } });
  };
}

/* ---- Importador masivo de comprobantes (carpeta ENTRADAS_Images de AppSheet) ---- */
async function importer(cobros, eMap) {
  const refs = {}; cobros.forEach((c) => { if (c.imagen) refs[imgName(c.imagen)] = c; });
  const names = Object.keys(refs);
  const have = new Set(await api("comprobantes"));
  const pend = names.filter((n) => !have.has(n)).length;
  const m = modal("Importar comprobantes", `<p>Hay <b>${names.length}</b> comprobantes referenciados en los cobros; <b>${names.length - pend}</b> ya están cargados y <b>${pend}</b> faltan.</p>
    <p style="color:var(--muted)">Selecciona las fotos de la carpeta <code>ENTRADAS_Images</code> de AppSheet (puedes elegir todas con Ctrl+A). Solo se suben las que coinciden por nombre con un cobro y aún no están cargadas.</p>
    <div class="field"><input type="file" id="files" accept="image/*" multiple></div><div id="sum" style="margin:.5rem 0"></div><div class="actions" style="justify-content:flex-end"><button class="btn" data-close2>Cerrar</button><button class="btn primary" id="go" disabled>Subir</button></div>`);
  $("[data-close2]", m.el).onclick = m.close;
  let todo = [];
  $("#files", m.el).onchange = (e) => {
    const sel = [...e.target.files]; const match = sel.filter((f) => refs[f.name]); const nuevos = match.filter((f) => !have.has(f.name));
    todo = nuevos;
    $("#sum", m.el).innerHTML = `${sel.length} archivos elegidos · <b>${nuevos.length}</b> por subir · ${match.length - nuevos.length} ya cargados · ${sel.length - match.length} sin cobro asociado (se ignoran)`;
    $("#go", m.el).disabled = !nuevos.length;
  };
  $("#go", m.el).onclick = async (ev) => {
    ev.target.disabled = true; let ok = 0; const errs = [];
    for (const [i, f] of todo.entries()) {
      $("#sum", m.el).innerHTML = `Subiendo ${i + 1} de ${todo.length}… <progress value="${i}" max="${todo.length}" style="width:100%"></progress>`;
      try { await uploadImage(f.name, await compressImage(f)); ok++; } catch (e) { errs.push(`${f.name}: ${e.message}`); }
    }
    $("#sum", m.el).innerHTML = `<b>${ok}</b> subidos${errs.length ? ` · <span class="pos">${errs.length} con error</span><ul>${errs.slice(0, 10).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : " correctamente."}`;
    toast(`${ok} comprobantes cargados`, errs.length > 0);
  };
}
