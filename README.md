# Milk Delivery Backend

One unified Node.js/Express + MongoDB backend serving all three of your frontends:

- **miLKadmin** — admin dashboard (email/password login)
- **milkwebapp** — customer app (phone+OTP or Google login)
- **deliverymilk** — delivery boy app (phone+password login)

It was built directly against the `/api/...` integration points already left as comments in `milkwebapp/script.js`, so the endpoint shapes match what your frontend expects.

## 1. Setup

```bash
cd milk-backend
npm install
cp .env.example .env      # then edit MONGO_URI / JWT_SECRET etc.
```

You need a MongoDB instance — either install locally (`mongod`) or use a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster and paste its connection string into `MONGO_URI` in `.env`.

## 2. Seed demo data (optional but recommended)

Loads the exact same products/orders/delivery boys/users/plans that are currently hardcoded in your frontend mock data, so all three apps have something real to talk to immediately:

```bash
npm run seed
```

This prints login credentials at the end:
- **Admin:** `admin@milk.com` / `admin123`
- **Delivery (approved):** `+919123455667` / `delivery123`
- **Customer OTP:** any phone number, dev mode accepts code `0000`

## 3. Run

```bash
npm run dev     # nodemon, auto-restart
npm start       # plain node
```

Server runs on `http://localhost:5000` by default. Health check: `GET /api/health`.

## Auth model

Every protected route expects `Authorization: Bearer <token>`. One JWT covers all three apps — the `role` embedded in it (`customer`, `delivery`, `owner`/`admin`/`manager`/`support`) is what the middleware checks, so no separate auth servers needed.

| App | Login route | Identity |
|---|---|---|
| Customer | `POST /api/auth/send-otp` → `POST /api/auth/verify-otp` | phone |
| Customer | `POST /api/auth/google` → `POST /api/auth/bind-phone` | Google + phone |
| Admin | `POST /api/auth/admin/login` | email/password (`Staff` model) |
| Delivery | `POST /api/auth/delivery/register` (pending approval) → `POST /api/auth/delivery/login` | phone/password |

**Two things intentionally stubbed for you to wire to real providers** (both clearly marked `TODO` in code):
1. `authController.googleAuth` — currently trusts a client-supplied `googleId`; swap in `google-auth-library` to verify the real ID token server-side before launch.
2. `gatewayController.js` — `/api/payments/create-order` and `/verify` return dev-mode fake IDs when `RAZORPAY_KEY_ID` is empty in `.env`; the exact Razorpay SDK calls are commented in place, just uncomment once you have real keys.
3. OTP SMS sending (`utils/otp.js`) — logs the code to the console in dev mode (`OTP_DEV_MODE=true`); swap `sendSms()` for Twilio/MSG91/etc.

## Endpoint map

```
Auth
  POST   /api/auth/send-otp
  POST   /api/auth/verify-otp
  POST   /api/auth/google
  POST   /api/auth/bind-phone
  POST   /api/auth/admin/login
  POST   /api/auth/delivery/login
  POST   /api/auth/delivery/register

Products                                  (admin write, public read)
  GET    /api/products            ?category=&available=
  GET    /api/products/:id
  POST   /api/products
  PUT    /api/products/:id
  DELETE /api/products/:id
  PATCH  /api/products/:id/stock  { delta }
  POST   /api/products/upload-image   (multipart "image")

Orders
  POST   /api/orders                       (customer places order — server prices it, checks stock)
  GET    /api/orders            ?status=   (admin: all · customer: own · delivery: assigned)
  GET    /api/orders/:id
  PATCH  /api/orders/:id/status  { status }
  PATCH  /api/orders/:id/assign  { deliveryBoyId }   (admin)

Delivery boys
  GET    /api/delivery-boys      ?status=  (admin)
  GET    /api/delivery-boys/me             (delivery)
  PATCH  /api/delivery-boys/me/location  { lat, lng }
  GET    /api/delivery-boys/:id            (admin)
  PATCH  /api/delivery-boys/:id/status  { status }
  PUT    /api/delivery-boys/:id
  PATCH  /api/delivery-boys/:id/password

Users (customers)
  GET    /api/users              (admin)
  GET    /api/users/me           (customer)
  PUT    /api/users/me
  POST   /api/users/me/addresses
  DELETE /api/users/me/addresses/:addrId
  GET    /api/users/:id/status   (public — matches your frontend's blocked-check comment)
  GET    /api/users/:id          (admin)
  PATCH  /api/users/:id/status   { status }   (admin: active/blocked/new)

Plans & Subscriptions
  GET    /api/plans                      (public, active only)
  GET    /api/plans/all                  (admin)
  POST/PUT/DELETE /api/plans[/:id]       (admin)
  POST   /api/subscriptions              (customer subscribes)
  GET    /api/subscriptions              (admin: all · customer: own)
  GET/PUT /api/subscriptions/:id
  PATCH  /api/subscriptions/:id/pause
  PATCH  /api/subscriptions/:id/resume

Coupons / Banners / Categories / Zones   (admin CRUD, public GET for active ones)
  GET    /api/coupons/validate  ?code=&total=   (customer checkout)
  GET/POST/PUT/DELETE /api/coupons[/:id]
  GET/POST/PUT/DELETE /api/banners[/:id]
  GET/POST/PUT/DELETE /api/categories[/:id]
  GET/POST/PUT/DELETE /api/zones[/:id]

Payments (admin Payment Manager screen)
  GET    /api/payments          ?status=
  GET    /api/payments/stats
  PATCH  /api/payments/:id/status
  POST   /api/payments/create-order   { amount, currency }   (customer checkout, Razorpay-shaped)
  POST   /api/payments/verify         { orderId, paymentId, signature }

Staff (admin team management)
  GET/POST/PUT/DELETE /api/staff[/:id]

Dashboard
  GET    /api/dashboard         (order count, revenue, low stock, pending drivers, status breakdown)
```

## Wiring the frontends

In each `script.js`, replace the in-memory arrays / demo functions with `fetch()` calls to these endpoints, e.g.:

```js
const res = await fetch('https://your-api.com/api/products');
products = await res.json();
```

and for authenticated calls:

```js
fetch('https://your-api.com/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ items, address })
});
```

## Real-time (Socket.IO)

The server now runs a WebSocket layer alongside the REST API — see **[SOCKETS.md](./SOCKETS.md)** for the full event list and frontend wiring for each of the three apps. Short version: admin edits (products, orders, coupons, driver approvals, user blocks, subscriptions, payments) push instantly to whichever app needs to know, live GPS streams from the delivery app to the admin map and to the customer's order-tracking screen, and the admin dashboard shows live online counts per role.

## Notes on scope

This covers every screen currently in the three frontends (products, orders, delivery boys, users, plans/subscriptions, coupons, banners, categories, zones, payments, staff, dashboard analytics). Deployment (Render/Railway/VPS + MongoDB Atlas), push notifications for order updates, and real-time driver tracking (would want Socket.IO/websockets on top of `/delivery-boys/me/location`) aren't built yet — happy to add whichever of those you need next.
