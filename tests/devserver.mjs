// Servidor de prueba local (sin Netlify): sirve /public y enruta /api/* a la función.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
process.env.LOCAL_STORE_DIR ||= new URL("../.localdata", import.meta.url).pathname;
const { default: handler } = await import("../netlify/functions/api.mjs");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handler(new Request("http://localhost:8888" + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }));
    const h = {}; r.headers.forEach((v, k) => (h[k] = v));
    res.writeHead(r.status, h); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  let f = path.join("public", req.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  if (!fs.existsSync(f)) f = "public/index.html";
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
}).listen(8888, () => console.log("listo http://localhost:8888"));
