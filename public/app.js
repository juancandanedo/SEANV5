import { S, esc, $, $$, api, toast, formModal, can } from "./lib.js";
import * as V from "./views.js";

const app = $("#app");
const ROUTES = {
  inicio: { t: "Inicio", i: "◧", roles: ["admin", "tesoreria", "tutor"], fn: V.dashboard },
  estudiantes: { t: "Estudiantes", i: "☺", roles: ["admin", "tesoreria", "tutor"], fn: V.estudiantes },
  cobros: { t: "Cobros", i: "$", roles: ["admin", "tesoreria"], fn: V.cobros },
  notas: { t: "Notas", i: "✎", roles: ["admin", "tutor"], fn: V.notas },
  reportes: { t: "Reportes", i: "▤", roles: ["admin", "tesoreria", "tutor"], fn: V.reportes },
  catalogos: { t: "Catálogos", i: "☰", roles: ["admin"], fn: V.catalogos },
  usuarios: { t: "Usuarios", i: "⚙", roles: ["admin"], fn: V.usuarios },
};

function authScreen(setup) {
  app.innerHTML = `<div class="auth"><form class="card" id="f" novalidate><h1>${setup ? "Configuración inicial" : "Seminarios"}</h1><p>${setup ? "Crea la cuenta de administrador. Se cargarán automáticamente tus datos (estudiantes, cobros y notas)." : "Control de cobros y notas"}</p><div class="err hidden" id="err"></div>
  ${setup ? '<div class="field"><label>Nombre</label><input name="nombre" required autocomplete="name"></div>' : ""}
  <div class="field"><label>Usuario</label><input name="usuario" required autocomplete="username" autocapitalize="off"></div>
  <div class="field"><label>Contraseña</label><input name="password" type="password" required autocomplete="${setup ? "new-password" : "current-password"}" ${setup ? 'minlength="8"' : ""}>${setup ? "<small>Mínimo 8 caracteres</small>" : ""}</div>
  <button class="btn primary" style="width:100%">${setup ? "Crear administrador y cargar datos" : "Entrar"}</button>${setup ? "" : '<p style="margin:.9rem 0 0;text-align:center"><a href="#" id="rec">¿Olvidaste tu contraseña?</a></p>'}</form></div>`;
  const rec = $("#rec"); if (rec) rec.onclick = (e) => { e.preventDefault(); formModal({ title: "Recuperar acceso", fields: [{ name: "usuario", label: "Usuario", required: true }, { name: "password", label: "Nueva contraseña", type: "password", required: true, autocomplete: "new-password", hint: "Mínimo 8 caracteres" }, { name: "key", label: "Clave de recuperación", type: "password", required: true, hint: "La variable RECOVERY_KEY configurada en Netlify" }], onSubmit: async (v, m) => { await api("recovery", "POST", v); m.close(); toast("Contraseña restablecida. Ya puedes entrar."); } }); };
  const form = $("#f"); $("input", form).focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = $("button", form); btn.disabled = true; $("#err").classList.add("hidden");
    try {
      await api(setup ? "setup" : "login", "POST", Object.fromEntries(new FormData(form)));
      location.hash = "#/inicio"; await boot();
    } catch (ex) { $("#err").textContent = ex.message; $("#err").classList.remove("hidden"); btn.disabled = false; }
  };
}

function shell() {
  const items = Object.entries(ROUTES).filter(([, r]) => r.roles.includes(S.user.rol));
  const ROL = { admin: "Administrador", tesoreria: "Tesorería", tutor: "Tutor" };
  app.innerHTML = `<div class="top"><button id="burger" aria-label="Menú">☰</button><b>${esc(S.settings.nombre_programa)}</b></div><div class="shell"><aside class="side" id="side"><div class="brand"><i>S</i>${esc(S.settings.nombre_programa)}</div><nav class="nav">${items.map(([k, r]) => `<a href="#/${k}" data-r="${k}"><span style="width:1.1em;text-align:center">${r.i}</span>${r.t}</a>`).join("")}</nav><div class="who"><b>${esc(S.user.nombre)}</b>${ROL[S.user.rol]}<div><button id="pw">Contraseña</button><button id="out">Salir</button></div></div></aside><main class="main" id="main"></main></div>`;
  $("#burger").onclick = () => $("#side").classList.toggle("open");
  $("#side").onclick = (e) => { if (e.target.closest("a")) $("#side").classList.remove("open"); };
  $("#out").onclick = async () => { await api("logout", "POST"); location.hash = ""; location.reload(); };
  $("#pw").onclick = () => formModal({ title: "Cambiar contraseña", fields: [{ name: "actual", label: "Contraseña actual", type: "password", required: true, autocomplete: "current-password" }, { name: "nueva", label: "Nueva contraseña", type: "password", required: true, autocomplete: "new-password", hint: "Mínimo 8 caracteres" }], onSubmit: async (v, m) => { await api("password", "POST", v); m.close(); toast("Contraseña actualizada"); } });
}

let navToken = 0;
async function route() {
  if (!S.user) return;
  const [, name = "inicio", param] = location.hash.split("/");
  const key = ROUTES[name] && ROUTES[name].roles.includes(S.user.rol) ? name : "inicio";
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === key));
  const main = $("#main"); const tok = ++navToken;
  main.onclick = null; main.replaceWith(main.cloneNode(false)); // limpia listeners previos
  const fresh = $("#main"); fresh.innerHTML = '<p class="boot">Cargando…</p>';
  try { await ROUTES[key].fn(fresh, param ? decodeURIComponent(param) : undefined); }
  catch (e) { if (tok === navToken) fresh.innerHTML = `<div class="err">No se pudo cargar: ${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

async function boot() {
  const s = await api("session");
  if (!s.user) return authScreen(s.needsSetup);
  S.user = s.user; S.settings = s.settings; S.cache = {}; S.tbl = {};
  shell(); await route();
}
window.addEventListener("hashchange", route);
boot().catch((e) => { app.innerHTML = `<div class="auth"><div class="card"><h1>No se pudo conectar</h1><p>${esc(e.message)}</p></div></div>`; });
