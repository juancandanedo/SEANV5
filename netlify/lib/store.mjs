// Capa de almacenamiento: Netlify Blobs en producción; carpeta local si LOCAL_STORE_DIR está definido (pruebas).
import { getStore } from "@netlify/blobs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function localStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (k) => path.join(dir, k.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".json");
  const etagOf = (txt) => crypto.createHash("md5").update(txt).digest("hex");
  return {
    async getWithMetadata(key) {
      try { const t = fs.readFileSync(file(key), "utf8"); return { data: JSON.parse(t), etag: etagOf(t) }; }
      catch { return null; }
    },
    async setJSON(key, value, opts = {}) {
      const f = file(key);
      const exists = fs.existsSync(f);
      if (opts.onlyIfNew && exists) return { modified: false };
      if (opts.onlyIfMatch) {
        if (!exists || etagOf(fs.readFileSync(f, "utf8")) !== opts.onlyIfMatch) return { modified: false };
      }
      const t = JSON.stringify(value); fs.writeFileSync(f, t);
      return { modified: true, etag: etagOf(t) };
    },
  };
}

let _store;
export function store() {
  if (_store) return _store;
  _store = process.env.LOCAL_STORE_DIR
    ? localStore(process.env.LOCAL_STORE_DIR)
    : getStore({ name: "seminarios", consistency: "strong" });
  return _store;
}

export async function readKey(key, fallback = null) {
  const r = await store().getWithMetadata(key, { type: "json", consistency: "strong" });
  return r ? r.data : fallback;
}

// Lee-modifica-escribe con control de concurrencia optimista (etag).
export async function mutate(key, fn, fallback = []) {
  for (let i = 0; i < 8; i++) {
    const r = await store().getWithMetadata(key, { type: "json", consistency: "strong" });
    const cur = r ? r.data : structuredClone(fallback);
    const next = await fn(cur);
    const res = await store().setJSON(key, next.value, r ? { onlyIfMatch: r.etag } : { onlyIfNew: true });
    if (res.modified !== false) return next.result;
    await new Promise((ok) => setTimeout(ok, 30 + Math.random() * 90));
  }
  throw Object.assign(new Error("Conflicto de escritura, intenta de nuevo"), { status: 409 });
}
