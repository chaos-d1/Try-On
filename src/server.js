import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { db } from "./db.js";
import { generateTryOn } from "./provider.js";

const PORT = process.env.PORT || 4000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "uploads");
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error("Set JWT_SECRET (16+ chars) in .env");
  process.exit(1);
}
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- helpers ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fileUrl = (name) => (name ? `${PUBLIC_URL}/files/${name}` : null);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, credits: u.credits });
const signToken = (u) => jwt.sign({ sub: u.id }, JWT_SECRET, { expiresIn: "7d" });
const productOut = (p) => ({
  id: p.id, name: p.name, description: p.description, price_cents: p.price_cents,
  category: p.category, image_url: fileUrl(p.image_path), active: !!p.active,
});
const tryonOut = (t) => ({
  id: t.id, status: t.status, product_id: t.product_id, error: t.error,
  person_image_url: fileUrl(t.person_image), garment_image_url: fileUrl(t.garment_image),
  result_image_url: fileUrl(t.result_image), created_at: t.created_at, completed_at: t.completed_at,
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- uploads ----------
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + EXT[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new HttpError(400, "Only JPEG, PNG or WebP images are allowed")),
});
const discard = (files) => Object.values(files || {}).flat().forEach((f) => fs.rmSync(f.path, { force: true }));

// ---------- app ----------
const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(",") }));
app.use(express.json({ limit: "100kb" }));
// Filenames are 128-bit random, so URLs are unguessable; the AI provider needs to fetch them.
app.use("/files", express.static(UPLOAD_DIR, { index: false, maxAge: "1h" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });

function auth(req, _res, next) {
  const h = req.headers.authorization || "";
  try {
    const { sub } = jwt.verify(h.replace(/^Bearer /, ""), JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(sub);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, "Login required"));
  }
}
const adminOnly = (req, _res, next) =>
  req.user.role === "admin" ? next() : next(new HttpError(403, "Admins only"));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- auth ----------
app.post("/api/auth/signup", authLimiter, wrap(async (req, res) => {
  const { email, password, name } = req.body || {};
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Valid email required");
  if (typeof password !== "string" || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
  const e = email.trim().toLowerCase();
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(e)) throw new HttpError(409, "Email already registered");
  const role = ADMIN_EMAILS.includes(e) ? "admin" : "user";
  const hash = await bcrypt.hash(password, 10);
  const r = db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(e, name?.toString().slice(0, 100) || null, hash, role);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(password || ""), user.password_hash)))
    throw new HttpError(401, "Invalid email or password");
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- products (the store) ----------
app.get("/api/products", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const where = ["active = 1"];
  const args = [];
  if (req.query.category) { where.push("category = ?"); args.push(String(req.query.category)); }
  if (req.query.q) { where.push("name LIKE ?"); args.push(`%${req.query.q}%`); }
  const w = where.join(" AND ");
  const total = db.prepare(`SELECT COUNT(*) c FROM products WHERE ${w}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM products WHERE ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, (page - 1) * limit);
  res.json({ items: rows.map(productOut), page, limit, total });
});

app.get("/api/products/:id", (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(req.params.id);
  if (!p) throw new HttpError(404, "Product not found");
  res.json(productOut(p));
});

app.post("/api/products", auth, adminOnly, upload.single("image"), (req, res) => {
  const { name, description, price_cents, category } = req.body;
  const price = parseInt(price_cents);
  if (!req.file || !name || !(price >= 0)) {
    discard({ f: req.file ? [req.file] : [] });
    throw new HttpError(400, "name, price_cents and image are required");
  }
  const r = db.prepare("INSERT INTO products (name, description, price_cents, category, image_path) VALUES (?,?,?,?,?)")
    .run(name, description || null, price, category || null, req.file.filename);
  res.status(201).json(productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(r.lastInsertRowid)));
});

app.patch("/api/products/:id", auth, adminOnly, (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!p) throw new HttpError(404, "Product not found");
  const b = req.body || {};
  db.prepare("UPDATE products SET name=?, description=?, price_cents=?, category=?, active=? WHERE id=?").run(
    b.name ?? p.name, b.description ?? p.description,
    b.price_cents !== undefined ? parseInt(b.price_cents) : p.price_cents,
    b.category ?? p.category, b.active !== undefined ? (b.active ? 1 : 0) : p.active, p.id);
  res.json(productOut(db.prepare("SELECT * FROM products WHERE id = ?").get(p.id)));
});

app.delete("/api/products/:id", auth, adminOnly, (req, res) => {
  db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(req.params.id); // soft delete keeps order history
  res.status(204).end();
});

// ---------- try-on ----------
const tryonLimiter = rateLimit({ windowMs: 60 * 1000, limit: 6 });

app.post("/api/tryons", auth, tryonLimiter,
  upload.fields([{ name: "person", maxCount: 1 }, { name: "garment", maxCount: 1 }]),
  (req, res) => {
    const person = req.files?.person?.[0];
    const garment = req.files?.garment?.[0];
    const productId = req.body.product_id ? parseInt(req.body.product_id) : null;
    try {
      if (!person) throw new HttpError(400, "A person photo is required (field: person)");
      let garmentName, category = null;
      if (garment) {
        garmentName = garment.filename;
      } else if (productId) {
        const p = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(productId);
        if (!p) throw new HttpError(404, "Product not found");
        garmentName = p.image_path; category = p.category;
      } else {
        throw new HttpError(400, "Provide a clothes photo (field: garment) or a product_id");
      }
      // Atomic credit deduction
      const spent = db.prepare("UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0").run(req.user.id);
      if (!spent.changes) throw new HttpError(402, "No try-on credits left");

      const r = db.prepare("INSERT INTO tryons (user_id, product_id, person_image, garment_image) VALUES (?,?,?,?)")
        .run(req.user.id, productId, person.filename, garmentName);
      const id = Number(r.lastInsertRowid);
      runJob(id, req.user.id, category); // fire and forget
      res.status(202).json(tryonOut(db.prepare("SELECT * FROM tryons WHERE id = ?").get(id)));
    } catch (e) {
      discard(req.files);
      throw e;
    }
  });

async function runJob(id, userId, category) {
  const t = db.prepare("SELECT * FROM tryons WHERE id = ?").get(id);
  db.prepare("UPDATE tryons SET status = 'processing' WHERE id = ?").run(id);
  const resultName = crypto.randomBytes(16).toString("hex") + ".png";
  try {
    await generateTryOn({
      personPath: path.join(UPLOAD_DIR, t.person_image),
      garmentPath: path.join(UPLOAD_DIR, t.garment_image),
      personUrl: fileUrl(t.person_image),
      garmentUrl: fileUrl(t.garment_image),
      outPath: path.join(UPLOAD_DIR, resultName),
      category,
    });
    db.prepare("UPDATE tryons SET status='done', result_image=?, completed_at=CURRENT_TIMESTAMP WHERE id=?").run(resultName, id);
  } catch (err) {
    console.error(`Try-on ${id} failed:`, err.message);
    db.prepare("UPDATE tryons SET status='failed', error=?, completed_at=CURRENT_TIMESTAMP WHERE id=?")
      .run("Generation failed, please try again", id);
    db.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").run(userId); // refund
  }
}

app.get("/api/tryons", auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM tryons WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(req.user.id);
  res.json({ items: rows.map(tryonOut) });
});

app.get("/api/tryons/:id", auth, (req, res) => {
  const t = db.prepare("SELECT * FROM tryons WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!t) throw new HttpError(404, "Try-on not found");
  res.json(tryonOut(t));
});

// ---------- cart & orders ----------
const cartRows = (uid) => db.prepare(`
  SELECT c.product_id, c.quantity, p.name, p.price_cents, p.image_path
  FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ? AND p.active = 1`).all(uid);

app.get("/api/cart", auth, (req, res) => {
  const items = cartRows(req.user.id).map((r) => ({
    product_id: r.product_id, name: r.name, quantity: r.quantity,
    price_cents: r.price_cents, image_url: fileUrl(r.image_path),
  }));
  res.json({ items, total_cents: items.reduce((s, i) => s + i.price_cents * i.quantity, 0) });
});

app.put("/api/cart/:productId", auth, (req, res) => {
  const qty = parseInt(req.body?.quantity);
  if (!(qty >= 0 && qty <= 99)) throw new HttpError(400, "quantity must be 0-99");
  if (!db.prepare("SELECT 1 FROM products WHERE id = ? AND active = 1").get(req.params.productId))
    throw new HttpError(404, "Product not found");
  if (qty === 0) db.prepare("DELETE FROM cart_items WHERE user_id=? AND product_id=?").run(req.user.id, req.params.productId);
  else db.prepare(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = excluded.quantity`).run(req.user.id, req.params.productId, qty);
  res.status(204).end();
});

// Creates the order from the cart. Plug a payment provider (Stripe/Razorpay) in here before marking it paid.
app.post("/api/orders", auth, (req, res) => {
  const items = cartRows(req.user.id);
  if (!items.length) throw new HttpError(400, "Cart is empty");
  const total = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  db.exec("BEGIN");
  try {
    const o = db.prepare("INSERT INTO orders (user_id, total_cents) VALUES (?, ?)").run(req.user.id, total);
    const ins = db.prepare("INSERT INTO order_items (order_id, product_id, quantity, price_cents) VALUES (?,?,?,?)");
    items.forEach((i) => ins.run(o.lastInsertRowid, i.product_id, i.quantity, i.price_cents));
    db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user.id);
    db.exec("COMMIT");
    res.status(201).json({ id: Number(o.lastInsertRowid), total_cents: total, status: "placed" });
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});

app.get("/api/orders", auth, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  const itemsStmt = db.prepare(`SELECT oi.product_id, oi.quantity, oi.price_cents, p.name
    FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`);
  res.json({ items: orders.map((o) => ({ ...o, items: itemsStmt.all(o.id) })) });
});

// ---------- errors ----------
app.use((req, _res, next) => next(new HttpError(404, "Not found")));
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) err = new HttpError(400, err.message);
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

// Jobs interrupted by a restart can never finish; fail and refund them.
for (const t of db.prepare("SELECT id, user_id FROM tryons WHERE status IN ('pending','processing')").all()) {
  db.prepare("UPDATE tryons SET status='failed', error='Interrupted by server restart' WHERE id=?").run(t.id);
  db.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").run(t.user_id);
}

export { app };
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

