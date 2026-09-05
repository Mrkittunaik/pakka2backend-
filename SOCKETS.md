# Real-time layer (Socket.IO)

## Stack, and how it actually works

**Socket.IO over WebSocket** — one persistent, always-open connection per app session (not repeated API calls). This is the same category of thing Zomato/Rapido use for live rider tracking: the client opens the pipe once at login and keeps it open; the server pushes messages down it the instant something happens, with zero polling.

```
deliverymilk (rider)  --ws--\
                              >-- Node/Express + Socket.IO server --ws--> milkwebapp (customer watching the map)
miLKadmin (dashboard) --ws--/                   |
                                           MongoDB (durability only,
                                           not in the live hot path)
```

- **Transport**: `socket.io` v4, WebSocket by default (auto-falls back to long-polling only if a network actively blocks WebSockets — handled transparently by the library)
- **Auth**: the same JWT from REST login, passed once at `io(url, { auth: { token } })` — no re-auth per message
- **Routing**: server-side **rooms**, not broadcast-to-everyone — a customer only receives their own order/driver updates, a driver only their own jobs, admins get the aggregate view
- **GPS hot path**: rider's phone → `socket.emit('driver:location', {...})` → server relays directly to the `admins` room and to that order's tracking room → customer's map pin moves. No database write sits in that path — DB is only touched periodically for durability/reload, not on every GPS tick, same as production delivery apps do to avoid hammering the database.

Every app connects to the **same** socket server with its JWT. The server figures out who you are and what room to put you in — you don't pick rooms yourself, except live order tracking.

```js
const socket = io('https://your-api.com', { auth: { token } });
```

## What each app should listen for

### miLKadmin (admin)
```js
socket.on('order:new', (order) => { /* prepend to orders list, bump badge */ });
socket.on('order:status', (order) => { /* update that order's card in place */ });
socket.on('order:assigned', (order) => { /* move it into "Out for delivery" */ });
socket.on('driver:status', (driver) => { /* move card between pending/approved/suspended columns */ });
socket.on('driver:updated', (driver) => { /* refresh that delivery boy's row */ });
socket.on('driver:location', ({ driverId, lat, lng }) => { /* move the pin on the live map */ });
socket.on('user:status', (user) => { /* update block/active badge */ });
socket.on('subscription:changed', (sub) => { /* update calendar/subscription list */ });
socket.on('payment:changed', (payment) => { /* update Payment Manager row */ });
socket.on('catalog:changed', ({ kind, doc }) => { /* kind: product|coupon|banner|category|plan|zone -> re-render that section */ });
socket.on('dashboard:stats', (stats) => { /* update the overview cards without re-fetching */ });
socket.on('liveCounts', ({ customersOnline, driversOnline, adminsOnline }) => { /* header live-count badges */ });
```

### milkwebapp (customer)
```js
socket.on('catalog:changed', ({ kind, doc }) => { /* admin edited a product/coupon/banner/plan -> refresh that list */ });
socket.on('order:status', (order) => { /* update "My Orders" + push a toast: "Order out for delivery" etc */ });
socket.on('order:assigned', (order) => { /* show driver name/phone once assigned */ });
socket.on('subscription:changed', (sub) => { /* reflect admin-side schedule/pause edits instantly */ });
socket.on('payment:changed', (payment) => { /* "Payment verified" confirmation without polling */ });
socket.on('user:status', (user) => { if (user.status === 'blocked') { /* force logout */ } });

// Live-track a specific order's delivery boy on the map:
socket.emit('order:track', orderId);
socket.on('driver:location', ({ lat, lng }) => { /* move the rider pin */ });
// leave the tracking room when the screen closes:
socket.emit('order:untrack', orderId);
```

### deliverymilk (delivery boy)
```js
socket.on('order:assigned', (order) => { /* new job drops straight into the queue, plays a sound */ });
socket.on('order:status', (order) => { /* keep in sync if admin/cust cancels etc */ });
socket.on('driver:status', (me) => { if (me.status === 'approved') { /* unlock the app immediately after admin approval - no re-login */ } });

// Stream GPS while an order is "out" (lowest latency path — bypasses REST):
navigator.geolocation.watchPosition((pos) => {
  socket.emit('driver:location', {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    orderId: currentOrderId // optional, also broadcasts to that order's tracking room
  });
});
```

## Why both a socket event *and* a location PATCH route exist

`PATCH /api/delivery-boys/me/location` persists the last known location to MongoDB (so a fresh page load or the admin's non-realtime views still have something to show). The `driver:location` socket event is the high-frequency, low-latency stream used *while actively delivering* — use the socket for the live map, use the REST route as a periodic (e.g. every 30s) durability checkpoint or a fallback if the socket briefly disconnects.

## Subscription skip-a-day (cutoff-verified)

Matches how your admin's `subQtyOnDate(sub, date)` calendar logic already works — it just needs one more check added once wired up: treat a date in `subscription.skippedDates` as zero quantity, same as if `custom[weekday] === 'none'`.

```
GET    /api/subscriptions/:id/skip-window?date=2026-09-08   -> { allowed, reason?, cutoffAt }
POST   /api/subscriptions/:id/skip        { date: "2026-09-08" }
DELETE /api/subscriptions/:id/skip/2026-09-08
```

Rules (configurable in `.env`):
- **Morning slot** — must skip by **9:00 PM the day before**.
- **Evening slot** — must skip by **2:00 PM the same day**.

The cutoff is enforced **server-side** in all three routes — the customer app should call `skip-window` first to decide whether to even show the button and what the deadline text says, but even if a request slips through after the deadline, the backend rejects it. `subscription:changed` fires on every skip/unskip so the admin's delivery calendar drops or restores that date live, with no refresh.

## Live counts

`liveCounts` (admins only) reports how many sockets are currently connected per role — a simple, honest "N customers browsing / N drivers online / N admins online" you can show on the dashboard. It's in-memory per server process; if you ever scale to multiple backend instances you'd want a Redis adapter for Socket.IO (`@socket.io/redis-adapter`) so rooms and counts are shared across instances — flag it if you get there and I'll wire it in.

## Everything that now updates live, end to end

| Admin does this | Who sees it instantly |
|---|---|
| Edits/adds/removes a product | Customer app catalog, delivery app (if it shows products) |
| Approves/suspends a delivery boy | That delivery boy's app (unlocks/locks without re-login) |
| Assigns an order to a driver | Driver's job queue, customer's order tracker |
| Changes an order's status | Customer, assigned driver, other admin screens |
| Blocks/unblocks a user | That customer's session |
| Edits a coupon/banner/category/plan/zone | Customer app (and admin's other open tabs) |
| Edits/pauses/resumes a subscription | That customer's app |
| Marks a payment paid/refunded | Customer + admin Payment Manager |
| — | Admin dashboard cards update after every order event, no refresh |
| — | Driver's live GPS shows on admin map + customer's order-tracking screen |
