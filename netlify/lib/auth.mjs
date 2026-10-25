import crypto from "node:crypto";
import { readKey, store } from "./store.mjs";

const b64 = (b) => Buffer.from(b).toString("base64url");

export async function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let s = await readKey("config_secret");
  if (!s) {
    const fresh = crypto.randomBytes(32).toString("hex");
    await store().setJSON("config_secret", fresh, { onlyIfNew: true });
    s = await readKey("config_secret");
  }
  return s;
}

export function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}
export function checkPassword(pw, user) {
  const { hash } = hashPassword(pw, user.salt);
  const a = Buffer.from(hash, "hex"), b = Buffer.from(user.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function sign(payload, days = 7) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac("sha256", await secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export async function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const good = crypto.createHmac("sha256", await secret()).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp > Date.now() ? p : null;
}
export function cookieOf(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? m[1] : null;
}
