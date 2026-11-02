
process.env.DB_PATH = ":memory:";
process.env.UPLOAD_DIR = "/tmp/tryon-test-uploads";
process.env.JWT_SECRET = "test-secret-test-secret";
process.env.ADMIN_EMAILS = "admin@x.com";
process.env.PUBLIC_URL = "http://localhost:4999";
const { app } = await import("../src/server.js");
const server = app.listen(4999);
const base = "http://localhost:4999/api";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const img = (n) => new Blob([png], { type: "image/png" });
const j = async (r) => ({ status: r.status, body: r.status === 204 ? null : await r.json() });
const post = (p, body, token) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) }, body: JSON.stringify(body) }).then(j);
const form = (p, fd, token) => fetch(base + p, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd }).then(j);
const get = (p, token) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(j);
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok  -", m); };

const admin = (await post("/auth/signup", { email: "admin@x.com", password: "password123" })).body;
ok(admin.user.role === "admin", "admin signup");
const u = (await post("/auth/signup", { email: "u@x.com", password: "password123", name: "U" })).body;
ok(u.user.role === "user" && u.user.credits === 3, "user signup with 3 credits");
ok((await post("/auth/login", { email: "u@x.com", password: "wrong" })).status === 401, "bad login rejected");

let fd = new FormData(); fd.append("name", "Shirt"); fd.append("price_cents", "1999"); fd.append("category", "tops"); fd.append("image", img(), "s.png");
ok((await form("/products", fd, u.token)).status === 403, "non-admin cannot add product");
const prod = (await form("/products", fd, admin.token)).body;
ok(prod.id && prod.image_url, "admin adds product");
ok((await get("/products")).body.total === 1, "product list");

fd = new FormData(); fd.append("person", img(), "p.png"); fd.append("product_id", String(prod.id));
const t = await form("/tryons", fd, u.token);
ok(t.status === 202, "try-on accepted with store product");
await new Promise((r) => setTimeout(r, 2200));
const done = (await get(`/tryons/${t.body.id}`, u.token)).body;
ok(done.status === "done" && done.result_image_url, "try-on completes");
ok((await get("/me", u.token)).body.user.credits === 2, "credit deducted");

fd = new FormData(); fd.append("person", img(), "p.png");
ok((await form("/tryons", fd, u.token)).status === 400, "missing garment rejected");
fd = new FormData(); fd.append("person", new Blob(["x"], { type: "text/plain" }), "p.txt"); fd.append("garment", img(), "g.png");
ok((await form("/tryons", fd, u.token)).status === 400, "non-image rejected");

ok((await fetch(base + "/cart/" + prod.id, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${u.token}` }, body: JSON.stringify({ quantity: 2 }) })).status === 204, "add to cart");
ok((await get("/cart", u.token)).body.total_cents === 3998, "cart total");
ok((await post("/orders", {}, u.token)).status === 201, "order placed");
ok((await get("/cart", u.token)).body.items.length === 0, "cart cleared");
ok((await get("/tryons")).status === 401, "auth required");
server.close(); process.exit(0);
