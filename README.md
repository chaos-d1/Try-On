# Try-On AI backend

Node 22.13+ · Express · built-in SQLite (`node:sqlite`) · JWT auth.

## Run
```bash
cp .env.example .env     # set JWT_SECRET
npm install
npm start                # http://localhost:4000
npm test                 # end-to-end smoke test
```

## API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` · `/api/auth/login` | `{email, password, name?}` → `{token, user}`. New users get 3 credits |
| GET | `/api/me` | current user + credits |
| GET | `/api/products` | `?q=&category=&page=&limit=` |
| GET | `/api/products/:id` | |
| POST/PATCH/DELETE | `/api/products[/:id]` | admin only; POST is multipart (`name, price_cents, category, description, image`) |
| POST | `/api/tryons` | multipart: `person` (file) + either `garment` (file, the "Upload Clothes Photo" button) or `product_id` (store item). Returns 202 + job |
| GET | `/api/tryons/:id` | poll until `status` is `done` or `failed` (`result_image_url`) |
| GET | `/api/tryons` | your history |
| GET/PUT | `/api/cart`, `/api/cart/:productId` | PUT `{quantity}`, 0 removes |
| POST/GET | `/api/orders` | checkout from cart / history |

Send `Authorization: Bearer <token>` on everything except products and auth.

## Frontend wiring
- **Login** → `POST /api/auth/login`, store the token.
- **Upload Photo / Upload Clothes Photo** → keep both files in state.
- **Get the Try-On result** → `POST /api/tryons` as `FormData`, then poll `GET /api/tryons/:id` every 2s and show `result_image_url`.

## Going live
- `TRYON_PROVIDER=mock` just echoes the person photo. For real results set `TRYON_PROVIDER=replicate`, add `REPLICATE_API_TOKEN` and `REPLICATE_MODEL_VERSION` (a virtual try-on model such as IDM-VTON; check its input names in `src/provider.js`). `PUBLIC_URL` must be publicly reachable so the provider can fetch the images.
- Checkout has no payment step yet: add Stripe/Razorpay in `POST /api/orders`.
- Uploaded files are served by unguessable random names. For stricter privacy of user photos, move to S3/R2 with signed URLs.
- Set `CORS_ORIGIN` to your frontend's URL, and use a persistent volume for `tryon.db` and `uploads/`.
