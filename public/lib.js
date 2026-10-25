// Utilidades compartidas: API, formato, modales, tablas, exportación
export const S = { user: null, settings: { nota_minima: 70, precio_libro: 25, nombre_programa: "Seminarios" }, cache: {} };

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function api(path, method = "GET", body) {
  const r = await fetch("/api/" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  let data = null; try { data = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && !/^(login|setup|session)/.test(path)) { location.reload(); }
    throw new Error((data && data.error) || "Error " + r.status);
  }
  return data;
}

// Caché de colecciones
export async function col(name, force = false) {
  if (force || !S.cache[name]) S.cache[name] = await api("data/" + name);
  return S.cache[name];
}
export const cols = (...names) => Promise.all(names.map((n) => col(n))).then((arr) => Object.fromEntries(names.map((n, i) => [n, arr[i]])));
export const invalidate = (...names) => names.forEach((n) => delete S.cache[n]);
export const idx = (rows, key = "id") => Object.fromEntries(rows.map((r) => [r[key], r]));

// Formato
const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => (n < 0 ? "-$" : "$") + nf.format(Math.abs(n || 0));
export const fdate = (s) => (s ? s.split("-").reverse().join("/") : "");
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const pct = (n) => (n * 100).toFixed(1) + "%";
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const libroLabel = (n) => (n ? `N${n.nivel} · Libro ${n.libro} · ${n.nombre}` : "—");
export const can = (...roles) => roles.includes(S.user?.rol);

export function toast(msg, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : ""); t.textContent = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), 3800);
}

// Modal genérico
export function modal(title, html, { wide = false, onClose } = {}) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" data-close aria-label="Cerrar">×</button></header><div class="mbody">${html}</div></div>`;
  const close = () => { ov.remove(); document.body.classList.remove("printing"); onClose?.(); };
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) close(); });
  $("[data-close]", ov).onclick = close;
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape" && ov.isConnected) { close(); document.removeEventListener("keydown", k); } });
  document.body.append(ov);
  return { el: ov, body: $(".mbody", ov), close };
}

function fieldHtml(f, v) {
  const val = v ?? f.value ?? "";
  const req = f.required ? " required" : "";
  const dis = f.disabled ? " disabled" : "";
  let input;
  if (f.type === "select") {
    input = `<select name="${f.name}"${req}${dis}>${f.blank !== false ? `<option value="">${esc(f.blank || "—")}</option>` : ""}${f.options.map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(val) ? "selected" : ""}>${esc(o.t)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") input = `<textarea name="${f.name}" rows="2"${req}${dis}>${esc(val)}</textarea>`;
  else input = `<input name="${f.name}" type="${f.type || "text"}" value="${esc(val)}"${f.step ? ` step="${f.step}"` : ""}${f.min !== undefined ? ` min="${f.min}"` : ""}${f.max !== undefined ? ` max="${f.max}"` : ""}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ""}${req}${dis}>`;
  return `<div class="field"><label>${esc(f.label)}${f.required ? " *" : ""}</label>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</div>`;
}

// Formulario modal: fields = [{name,label,type,options,required,...}] (agrupa de a 2 con row:true)
export function formModal({ title, fields, values = {}, submitText = "Guardar", onSubmit, wide = false, extra = "" }) {
  const body = fields.map((f) => fieldHtml(f, values[f.name])).join("");
  const m = modal(title, `<form novalidate><div class="err hidden"></div><div class="row">${body}</div>${extra}<div class="actions" style="justify-content:flex-end;margin-top:.6rem"><button type="button" class="btn" data-close2>Cancelar</button><button class="btn primary">${esc(submitText)}</button></div></form>`, { wide });
  const form = $("form", m.el), err = $(".err", m.el);
  $("[data-close2]", m.el).onclick = m.close;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const btn = $(".primary", form); btn.disabled = true; err.classList.add("hidden");
    try { await onSubmit(data, m); } catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); btn.disabled = false; }
  });
  setTimeout(() => $("input:not([disabled]),select:not([disabled])", form)?.focus(), 30);
  return m;
}

export function confirmBox(msg, onYes, yesText = "Eliminar") {
  const m = modal("Confirmar", `<p>${esc(msg)}</p><div class="actions" style="justify-content:flex-end"><button class="btn" data-no>Cancelar</button><button class="btn primary danger" data-yes style="background:var(--bad);border-color:var(--bad);color:#fff">${esc(yesText)}</button></div>`);
  $("[data-no]", m.el).onclick = m.close;
  $("[data-yes]", m.el).onclick = async () => { try { await onYes(); m.close(); } catch (e) { toast(e.message, true); m.close(); } };
}

// Tabla con orden por columna y "ver más".
// cols: [{k, t, num, render(row)->html, sort(row)->valor, nosort}]
export function table(id, columns, rows, { pageSize = 100, empty = "Sin registros", defaultSort, footer } = {}) {
  const st = (S.tbl ||= {})[id] ||= { sort: defaultSort || null, shown: pageSize };
  let data = rows;
  if (st.sort) {
    const c = columns.find((x) => x.k === st.sort.k);
    if (c) {
      const val = c.sort || ((r) => r[c.k]);
      data = [...rows].sort((a, b) => { const x = val(a), y = val(b); const r = x == null ? -1 : y == null ? 1 : typeof x === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true }); return r * st.sort.dir; });
    }
  }
  const slice = data.slice(0, st.shown);
  const head = columns.map((c) => `<th class="${c.num ? "num" : ""} ${c.nosort ? "nosort" : ""}" data-sort="${c.nosort ? "" : c.k}" data-tbl="${id}">${esc(c.t)}${st.sort?.k === c.k ? (st.sort.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("");
  const body = slice.map((r) => `<tr>${columns.map((c) => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${c.render ? c.render(r) : esc(r[c.k] ?? "")}</td>`).join("")}</tr>`).join("");
  return `<div class="tablewrap" data-tblwrap="${id}"><table><thead><tr>${head}</tr></thead><tbody>${body || ""}</tbody></table>${rows.length ? "" : `<div class="empty">${esc(empty)}</div>`}<div class="foot"><span>${slice.length} de ${rows.length}</span>${rows.length > st.shown ? `<button class="btn sm" data-more="${id}">Ver ${Math.min(pageSize, rows.length - st.shown)} más</button>` : ""}<span>${footer || ""}</span></div></div>`;
}
// Delegación para orden / ver más; `rerender` redibuja la vista
export function bindTables(root, rerender) {
  if (root._th) root.removeEventListener("click", root._th);
  root._th = (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th && th.dataset.sort) {
      const st = S.tbl[th.dataset.tbl]; const k = th.dataset.sort;
      st.sort = st.sort?.k === k ? { k, dir: -st.sort.dir } : { k, dir: 1 }; rerender(); return;
    }
    const more = e.target.closest("[data-more]");
    if (more) { const st = S.tbl[more.dataset.more]; st.shown += 100; rerender(); }
  };
  root.addEventListener("click", root._th);
}

export function exportXlsx(filename, rows, sheet = "Datos") {
  if (!rows.length) return toast("No hay datos para exportar", true);
  if (window.XLSX) {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]).map((k) => ({ wch: Math.min(40, Math.max(k.length, ...rows.slice(0, 200).map((r) => String(r[k] ?? "").length)) + 2) }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30));
    XLSX.writeFile(wb, filename + ".xlsx");
  } else { // respaldo CSV si la librería no cargó
    const keys = Object.keys(rows[0]);
    const csv = "﻿" + [keys, ...rows.map((r) => keys.map((k) => r[k]))].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = filename + ".csv"; a.click();
  }
}

// ---------- cálculos de dominio ----------
export function saldoPorEstudiante(cobros) {
  const m = {};
  for (const c of cobros) {
    const s = (m[c.estudiante_id] ||= { debe: 0, pago: 0, ultimoPago: null });
    s.debe += c.debe || 0; s.pago += c.pago || 0;
    if (c.pago > 0 && (!s.ultimoPago || c.fecha > s.ultimoPago)) s.ultimoPago = c.fecha;
  }
  for (const s of Object.values(m)) { s.debe = Math.round(s.debe * 100) / 100; s.pago = Math.round(s.pago * 100) / 100; s.saldo = Math.round((s.debe - s.pago) * 100) / 100; }
  return m;
}
export const saldoPill = (s) => s > 0.004 ? `<span class="pos">${money(s)}</span>` : s < -0.004 ? `<span class="neg">${money(s)} a favor</span>` : `<span class="pill ok">Al día</span>`;
export const notaPct = (n) => (n.total ? n.nota / n.total : 0);
export const aprobado = (n) => notaPct(n) * 100 >= S.settings.nota_minima;
export const resultPill = (n) => aprobado(n) ? `<span class="pill ok">Aprobado</span>` : `<span class="pill bad">Reprobado</span>`;
