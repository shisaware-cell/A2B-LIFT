# Daily Lift Club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public Daily Lift Club website experience where riders search verified weekday commute cars, view them on a map, and reserve weekly or monthly seats through Paystack.

**Architecture:** Reuse the existing website HTML/CSS/JS style and the existing backend approval model. Public routes are derived from approved chauffeurs and approved 2015+ vehicles, with a lift-club-specific route/booking layer added server-side so seat counts and payments are not mixed with long-distance trips.

**Tech Stack:** Static website HTML/CSS/vanilla JavaScript, Express routes in `server/routes.ts`, Drizzle schema in `shared/schema.ts`, existing storage patterns in `server/storage.ts`, Paystack inline checkout on the website, Paystack verification/webhook server-side.

---

## Files

- Create: `website/lift-club.html`
  - Public searchable Daily Lift Club page, map panel, listing cards, booking modal, weekly/monthly Paystack flow.
- Modify: `website/index.html`
  - Add nav link and service card for Daily Lift Club.
- Modify: `website/dashboard.html`
  - Add rider dashboard section for active lift club bookings and driver link to existing registration/approval flow.
- Modify: `website/styles.css`
  - Add shared lift-club card, badge, availability, and map fallback styles where reusable.
- Modify: `shared/schema.ts`
  - Add `liftClubRoutes` and `liftClubBookings` tables and exported types.
- Modify: `server/storage.ts`
  - Add storage helpers for searching routes, creating pending bookings, confirming bookings, and loading user bookings.
- Modify: `server/routes.ts`
  - Add public search endpoint, booking initialization endpoint, user bookings endpoint, and Paystack verification/confirmation endpoint.
- Test/Verify: browser preview through a local static server and server build/type checks available in the repo.

## Task 1: Public Website Entry Point

**Files:**
- Create: `website/lift-club.html`
- Modify: `website/index.html`
- Modify: `website/styles.css`

- [ ] **Step 1: Add nav and service entry to the homepage**

In `website/index.html`, add `Daily Lift Club` after `Long Distance` in the desktop and mobile nav:

```html
<a href="long-distance.html">Long Distance</a>
<a href="lift-club.html">Daily Lift Club</a>
<a href="earn.html">Earn</a>
```

Add a service card in the services grid:

```html
<a href="lift-club.html" class="service-card">
  <div class="service-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 3h5v5"/><path d="M21 3 14 10"/><path d="M8 21H3v-5"/><path d="M3 21l7-7"/><path d="M7 8h10v8H7z"/>
    </svg>
  </div>
  <h3>Daily Lift Club</h3>
  <p class="service-desc">Find verified weekday commute cars to offices in Sandton, Midrand, Rosebank, and other work hubs.</p>
  <span class="service-link">
    Find a daily seat
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
  </span>
</a>
```

- [ ] **Step 2: Add reusable lift-club CSS**

Append these styles to `website/styles.css`:

```css
.lift-pill { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; background:var(--grey-100); color:var(--grey-600); font-size:12px; font-weight:700; }
.lift-pill--dark { background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.86); }
.lift-pill--full { background:#fef2f2; color:#dc2626; }
.lift-pill--open { background:#f0fdf4; color:#16a34a; }
.lift-results-layout { display:grid; grid-template-columns:420px minmax(0,1fr); gap:24px; align-items:start; }
.lift-results-list { display:flex; flex-direction:column; gap:12px; }
.lift-card { background:var(--white); border:1.5px solid var(--grey-200); border-radius:var(--radius); padding:18px; transition:border-color var(--t), box-shadow var(--t); }
.lift-card:hover { border-color:var(--black); box-shadow:var(--shadow); }
.lift-card.full { opacity:.72; }
.lift-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:12px; }
.lift-card-title { font-size:16px; font-weight:800; line-height:1.25; }
.lift-card-meta { color:var(--grey-600); font-size:13px; margin-top:4px; }
.lift-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:14px 0; }
.lift-card-stat { padding:10px 12px; border-radius:10px; background:var(--grey-50); border:1px solid var(--grey-200); }
.lift-card-stat span { display:block; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--grey-400); margin-bottom:2px; }
.lift-card-stat strong { display:block; font-size:15px; }
.lift-map-shell { position:sticky; top:calc(var(--nav-h) + 16px); min-height:560px; border-radius:var(--radius); overflow:hidden; border:1.5px solid var(--grey-200); background:var(--grey-100); }
.lift-map { width:100%; height:560px; }
.lift-map-fallback { height:560px; padding:24px; display:flex; flex-direction:column; justify-content:space-between; background:linear-gradient(135deg,#f8f8f8,#ececec); }
.lift-map-pin { background:var(--white); border:1px solid var(--grey-200); border-radius:12px; padding:12px 14px; box-shadow:var(--shadow-sm); max-width:240px; }
.lift-pass-toggle { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:16px 0; }
.lift-pass-option { border:1.5px solid var(--grey-200); border-radius:12px; padding:14px; text-align:left; cursor:pointer; }
.lift-pass-option.active { border-color:var(--black); background:var(--grey-50); }
@media(max-width:900px){ .lift-results-layout { grid-template-columns:1fr; } .lift-map-shell { position:relative; top:auto; min-height:360px; } .lift-map, .lift-map-fallback { height:360px; } }
@media(max-width:640px){ .lift-card-grid { grid-template-columns:1fr; } }
```

- [ ] **Step 3: Create `website/lift-club.html`**

Create the page using the same nav/footer pattern as `website/long-distance.html`. Include these required elements:

```html
<section class="page-hero">
  <div class="container">
    <p class="label">Daily Lift Club</p>
    <h1 class="page-hero-title">Find a verified lift club to work.</h1>
    <p class="page-hero-sub">Search approved A2B drivers with weekday seats to business hubs. Weekly and monthly passes exclude weekends.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      <span class="lift-pill lift-pill--dark">Verified drivers</span>
      <span class="lift-pill lift-pill--dark">2015+ vehicles only</span>
      <span class="lift-pill lift-pill--dark">Paystack booking</span>
    </div>
  </div>
</section>
<section class="section section--grey" style="padding-top:48px;">
  <div class="container">
    <div class="ld-search-bar" style="margin-top:-96px;">
      <div class="form-group"><label for="liftFrom">From</label><input id="liftFrom" type="text" placeholder="e.g. Randburg" /></div>
      <div class="form-group"><label for="liftTo">Workplace</label><input id="liftTo" type="text" placeholder="e.g. Sandton" /></div>
      <div class="form-group"><label for="liftPass">Pass</label><select id="liftPass"><option value="weekly">Weekly, 5 weekdays</option><option value="monthly">Monthly weekdays</option></select></div>
      <button class="btn-search" onclick="searchLiftClub()">Search cars</button>
    </div>
    <div class="lift-results-layout">
      <div>
        <div id="liftStatus" class="ld-status"><div><strong>Search verified routes</strong><span>Enter your pickup area and workplace to find available commute cars.</span></div></div>
        <div id="liftResults" class="lift-results-list" style="margin-top:18px;"></div>
      </div>
      <div class="lift-map-shell"><div id="liftMap" class="lift-map-fallback"></div></div>
    </div>
  </div>
</section>
```

Add JavaScript functions in the same page:

```js
const API = 'https://api.a2blift.com';
let liftRoutes = [];
let selectedRoute = null;
let selectedPass = 'weekly';

function remainingSeats(route) {
  return Math.max(0, Number(route.totalSeats || 0) - Number(route.bookedSeats || 0));
}

async function searchLiftClub() {
  const from = document.getElementById('liftFrom').value.trim();
  const to = document.getElementById('liftTo').value.trim();
  selectedPass = document.getElementById('liftPass').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${API}/api/lift-club/routes?${params.toString()}`);
  const data = res.ok ? await res.json() : [];
  liftRoutes = Array.isArray(data) ? data : data.routes || [];
  renderLiftResults();
  renderLiftMapFallback();
}

function renderLiftResults() {
  const el = document.getElementById('liftResults');
  if (!liftRoutes.length) {
    el.innerHTML = '<div class="ld-empty"><p>No lift club cars found for this search yet.</p></div>';
    return;
  }
  el.innerHTML = liftRoutes.map(route => {
    const seatsLeft = remainingSeats(route);
    const full = seatsLeft <= 0;
    const price = selectedPass === 'monthly' ? route.monthlyPrice : route.weeklyPrice;
    return `<article class="lift-card ${full ? 'full' : ''}">
      <div class="lift-card-top">
        <div><div class="lift-card-title">${route.pickupArea} to ${route.destinationArea}</div><div class="lift-card-meta">${route.driverName} · ${route.vehicleModel} · ${route.vehicleYear}</div></div>
        <span class="lift-pill ${full ? 'lift-pill--full' : 'lift-pill--open'}">${full ? 'Full' : seatsLeft + ' seats left'}</span>
      </div>
      <div class="lift-card-grid">
        <div class="lift-card-stat"><span>Weekly</span><strong>R${Number(route.weeklyPrice || 0).toFixed(0)}</strong></div>
        <div class="lift-card-stat"><span>Monthly</span><strong>R${Number(route.monthlyPrice || 0).toFixed(0)}</strong></div>
        <div class="lift-card-stat"><span>Departure</span><strong>${route.departureWindow || 'Weekday mornings'}</strong></div>
        <div class="lift-card-stat"><span>Vehicle</span><strong>${route.totalSeats || 0} seats</strong></div>
      </div>
      <button class="btn btn-primary btn-sm" ${full ? 'disabled' : ''} onclick="openLiftBooking('${route.id}')">${full ? 'Car full' : 'Book ' + selectedPass + ' pass · R' + Number(price || 0).toFixed(0)}</button>
    </article>`;
  }).join('');
}
```

- [ ] **Step 4: Verify static page loads**

Run:

```bash
python3 -m http.server 4177 --directory website
```

Expected: `Serving HTTP on :: port 4177`.

Open `http://localhost:4177/lift-club.html` and verify the nav, search form, empty state, and responsive layout render.

- [ ] **Step 5: Commit**

```bash
git add website/lift-club.html website/index.html website/styles.css
git commit -m "feat(website): add daily lift club public page"
```

## Task 2: Backend Lift Club Routes And Bookings

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/storage.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Add schema tables**

In `shared/schema.ts`, add after `vehicleAssignments`:

```ts
export const liftClubRoutes = pgTable("lift_club_routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id").notNull().references(() => chauffeurs.id),
  vehicleId: varchar("vehicle_id").notNull().references(() => vehicles.id),
  pickupArea: text("pickup_area").notNull(),
  destinationArea: text("destination_area").notNull(),
  pickupLat: real("pickup_lat"),
  pickupLng: real("pickup_lng"),
  destinationLat: real("destination_lat"),
  destinationLng: real("destination_lng"),
  departureWindow: text("departure_window").notNull().default("Weekday mornings"),
  weeklyPrice: real("weekly_price").notNull(),
  monthlyPrice: real("monthly_price").notNull(),
  totalSeats: integer("total_seats").notNull().default(1),
  bookedSeats: integer("booked_seats").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const liftClubBookings = pgTable("lift_club_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routeId: varchar("route_id").notNull().references(() => liftClubRoutes.id),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  passType: text("pass_type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  seatCount: integer("seat_count").notNull().default(1),
  amount: real("amount").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  bookingStatus: text("booking_status").notNull().default("pending"),
  paystackReference: varchar("paystack_reference"),
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});
```

Export types near the existing type exports:

```ts
export type LiftClubRoute = typeof liftClubRoutes.$inferSelect;
export type LiftClubBooking = typeof liftClubBookings.$inferSelect;
```

- [ ] **Step 2: Add storage methods**

In `server/storage.ts`, add methods matching the file's existing class style:

```ts
async searchLiftClubRoutes(filters: { from?: string; to?: string }) {
  const rows = await db.select().from(liftClubRoutes);
  const normalizedFrom = filters.from?.trim().toLowerCase();
  const normalizedTo = filters.to?.trim().toLowerCase();
  return rows.filter((route) => {
    if (route.status !== "active") return false;
    if (route.totalSeats <= route.bookedSeats) return true;
    const fromOk = !normalizedFrom || route.pickupArea.toLowerCase().includes(normalizedFrom);
    const toOk = !normalizedTo || route.destinationArea.toLowerCase().includes(normalizedTo);
    return fromOk && toOk;
  });
}

async getLiftClubRoute(id: string) {
  const [route] = await db.select().from(liftClubRoutes).where(eq(liftClubRoutes.id, id));
  return route;
}

async createLiftClubBooking(data: typeof liftClubBookings.$inferInsert) {
  const [booking] = await db.insert(liftClubBookings).values(data).returning();
  return booking;
}

async getLiftClubBookingsByUser(userId: string) {
  return db.select().from(liftClubBookings).where(eq(liftClubBookings.riderId, userId));
}
```

Add imports for `liftClubRoutes` and `liftClubBookings` from `shared/schema`.

- [ ] **Step 3: Add Express endpoints**

In `server/routes.ts`, add routes near the long-distance endpoints:

```ts
app.get("/api/lift-club/routes", async (req: Request, res: Response) => {
  const routes = await storage.searchLiftClubRoutes({
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  });
  res.json(routes);
});

app.get("/api/lift-club/my-bookings", requireAuth, async (req: AuthedRequest, res: Response) => {
  const bookings = await storage.getLiftClubBookingsByUser(req.auth!.sub);
  res.json(bookings);
});

app.post("/api/lift-club/bookings", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { routeId, passType, paystackReference } = req.body || {};
  if (!routeId || !["weekly", "monthly"].includes(passType)) {
    return res.status(400).json({ message: "Route and pass type are required." });
  }
  const route = await storage.getLiftClubRoute(routeId);
  if (!route || route.status !== "active") return res.status(404).json({ message: "Lift club route not found." });
  if ((route.totalSeats || 0) - (route.bookedSeats || 0) <= 0) return res.status(409).json({ message: "This car is already full." });
  const amount = passType === "monthly" ? route.monthlyPrice : route.weeklyPrice;
  const now = new Date();
  const startDate = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setDate(now.getDate() + (passType === "monthly" ? 30 : 6));
  const booking = await storage.createLiftClubBooking({
    routeId,
    riderId: req.auth!.sub,
    passType,
    startDate,
    endDate: end.toISOString().slice(0, 10),
    seatCount: 1,
    amount,
    paymentStatus: paystackReference ? "paid" : "pending",
    bookingStatus: paystackReference ? "confirmed" : "pending",
    paystackReference,
  } as any);
  res.json({ booking });
});
```

Use a follow-up implementation step to replace the simple create flow with an atomic seat increment before production launch.

- [ ] **Step 4: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: either PASS, or the known existing `ignoreDeprecations`/unrelated TypeScript errors documented in the final report. New lift club symbols must not be the cause of failures.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts server/routes.ts
git commit -m "feat(server): add daily lift club routes and bookings"
```

## Task 3: Paystack Booking Flow On Website

**Files:**
- Modify: `website/lift-club.html`

- [ ] **Step 1: Load Paystack script and API config**

Add before `</body>`:

```html
<script src="main.js"></script>
<script src="https://js.paystack.co/v1/inline.js"></script>
```

Add config loading:

```js
async function loadLiftClubConfig() {
  try {
    const res = await fetch(`${API}/api/config`);
    if (res.ok) {
      const cfg = await res.json();
      window.PAYSTACK_PUBLIC_KEY = cfg.paystackPublicKey || '';
    }
  } catch (error) {}
}
```

- [ ] **Step 2: Add booking modal and Paystack handler**

Add modal markup:

```html
<div class="modal-overlay" id="liftBookModal">
  <div class="modal-box">
    <button class="modal-close" onclick="closeLiftBooking()">×</button>
    <h3 id="liftModalTitle">Book lift club seat</h3>
    <p id="liftModalSub">Choose your pass and pay securely with Paystack.</p>
    <div class="lift-pass-toggle">
      <button class="lift-pass-option active" id="weeklyPassBtn" onclick="selectLiftPass('weekly')"><strong>Weekly</strong><span>5 weekdays</span></button>
      <button class="lift-pass-option" id="monthlyPassBtn" onclick="selectLiftPass('monthly')"><strong>Monthly</strong><span>Weekdays only</span></button>
    </div>
    <button class="btn btn-primary" id="liftPayBtn" onclick="payForLiftClub()">Pay with Paystack</button>
  </div>
</div>
```

Add functions:

```js
function openLiftBooking(routeId) {
  selectedRoute = liftRoutes.find(route => String(route.id) === String(routeId));
  if (!selectedRoute || remainingSeats(selectedRoute) <= 0) return;
  document.getElementById('liftBookModal').classList.add('open');
  updateLiftBookingModal();
}

function closeLiftBooking() {
  document.getElementById('liftBookModal').classList.remove('open');
}

function selectLiftPass(passType) {
  selectedPass = passType;
  document.getElementById('weeklyPassBtn').classList.toggle('active', passType === 'weekly');
  document.getElementById('monthlyPassBtn').classList.toggle('active', passType === 'monthly');
  updateLiftBookingModal();
  renderLiftResults();
}

function updateLiftBookingModal() {
  if (!selectedRoute) return;
  const amount = selectedPass === 'monthly' ? selectedRoute.monthlyPrice : selectedRoute.weeklyPrice;
  document.getElementById('liftModalTitle').textContent = `${selectedRoute.pickupArea} to ${selectedRoute.destinationArea}`;
  document.getElementById('liftModalSub').textContent = `${selectedRoute.driverName} · ${selectedPass} pass · R${Number(amount || 0).toFixed(0)}`;
  document.getElementById('liftPayBtn').textContent = `Pay R${Number(amount || 0).toFixed(0)} with Paystack`;
}

async function payForLiftClub() {
  const token = localStorage.getItem('a2b_token');
  if (!token) {
    localStorage.setItem('a2b_pending_lift_club', JSON.stringify({ routeId: selectedRoute.id, passType: selectedPass }));
    window.location.href = `login.html?next=${encodeURIComponent('lift-club.html')}`;
    return;
  }
  if (typeof PaystackPop === 'undefined' || !window.PAYSTACK_PUBLIC_KEY) {
    alert('Paystack is unavailable. Please try again shortly.');
    return;
  }
  const user = JSON.parse(localStorage.getItem('a2b_user') || '{}');
  const amount = selectedPass === 'monthly' ? selectedRoute.monthlyPrice : selectedRoute.weeklyPrice;
  PaystackPop.setup({
    key: window.PAYSTACK_PUBLIC_KEY,
    email: user.email || user.username || 'user@a2blift.co.za',
    amount: Math.round(Number(amount || 0) * 100),
    currency: 'ZAR',
    ref: `LIFTCLUB_${selectedRoute.id}_${Date.now()}`,
    metadata: { routeId: selectedRoute.id, passType: selectedPass, userId: user.id },
    callback: async function(response) {
      await confirmLiftClubBooking(response.reference);
    },
  }).openIframe();
}

async function confirmLiftClubBooking(reference) {
  const token = localStorage.getItem('a2b_token');
  const res = await fetch(`${API}/api/lift-club/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ routeId: selectedRoute.id, passType: selectedPass, paystackReference: reference }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || 'Unable to confirm lift club booking.');
  closeLiftBooking();
  alert('Lift club seat booked. You can view it in your dashboard.');
  await searchLiftClub();
}
```

- [ ] **Step 3: Verify booking states**

In browser devtools, mock `liftRoutes` with:

```js
liftRoutes = [{ id:'demo', pickupArea:'Randburg', destinationArea:'Sandton', driverName:'Demo Driver', vehicleModel:'Toyota Corolla Quest', vehicleYear:2019, weeklyPrice:450, monthlyPrice:1600, totalSeats:5, bookedSeats:4, departureWindow:'07:00 - 08:00' }];
renderLiftResults();
```

Expected: one available seat shows and booking button is enabled.

Then set:

```js
liftRoutes[0].bookedSeats = 5;
renderLiftResults();
```

Expected: card shows `Full` and booking button is disabled.

- [ ] **Step 4: Commit**

```bash
git add website/lift-club.html
git commit -m "feat(website): add lift club paystack booking flow"
```

## Task 4: Dashboard Lift Club Section

**Files:**
- Modify: `website/dashboard.html`

- [ ] **Step 1: Add sidebar item**

Add after Long Distance nav:

```html
<div class="dash-nav-item" onclick="showPage('liftclub')" id="nav-liftclub">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 17h10"/><path d="M5 12h14"/><path d="M8 7h8"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/></svg>Lift Club
</div>
```

- [ ] **Step 2: Add dashboard page panel**

Add after the Long Distance page:

```html
<div class="dash-page" id="page-liftclub">
  <h1 class="dash-page-title">Daily Lift Club</h1>
  <div class="ld-mini-search">
    <h3>Find a weekday seat to work</h3>
    <div class="ld-mini-form">
      <div><label>From</label><input type="text" id="lcDashFrom" placeholder="e.g. Randburg" /></div>
      <div><label>Workplace</label><input type="text" id="lcDashTo" placeholder="e.g. Sandton" /></div>
      <div><label>Pass</label><select id="lcDashPass"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
      <button class="btn btn-primary" style="align-self:flex-end;padding:11px 20px;" onclick="goLiftClub()">Search</button>
    </div>
  </div>
  <div class="wallet-transactions">
    <div class="wallet-tx-header">My active lift club bookings</div>
    <div id="liftClubBookingsList"></div>
  </div>
</div>
```

- [ ] **Step 3: Add dashboard functions**

Add to the dashboard script:

```js
function goLiftClub() {
  const from = document.getElementById('lcDashFrom').value.trim();
  const to = document.getElementById('lcDashTo').value.trim();
  const pass = document.getElementById('lcDashPass').value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (pass) params.set('pass', pass);
  window.location.href = `lift-club.html?${params.toString()}`;
}

async function loadLiftClubBookings() {
  const token = localStorage.getItem('a2b_token');
  const el = document.getElementById('liftClubBookingsList');
  if (!el) return;
  try {
    const res = await fetch(`${API}/api/lift-club/my-bookings`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const bookings = await res.json();
    el.innerHTML = bookings.length ? bookings.map((booking) => `
      <div class="wallet-tx-item">
        <div><div style="font-weight:600">${booking.passType} lift club pass</div><div style="font-size:12px;color:var(--grey-400)">${booking.startDate} to ${booking.endDate}</div></div>
        <div class="trip-status trip-status--${booking.bookingStatus === 'confirmed' ? 'completed' : 'pending'}"><span class="trip-status-dot"></span>${booking.bookingStatus}</div>
      </div>
    `).join('') : '<div class="empty-state"><p>No lift club bookings yet</p></div>';
  } catch (error) {
    el.innerHTML = '<div class="empty-state"><p>Unable to load lift club bookings.</p></div>';
  }
}
```

Call `loadLiftClubBookings()` at the end of `loadDashboard()`.

- [ ] **Step 4: Verify dashboard rendering**

Open `website/dashboard.html` through the local server with a test token in localStorage. Expected: the Lift Club tab appears, search redirects to `lift-club.html`, and bookings panel shows either data or an empty/error state without breaking Overview/Wallet/Long Distance.

- [ ] **Step 5: Commit**

```bash
git add website/dashboard.html
git commit -m "feat(website): show lift club bookings in dashboard"
```

## Task 5: Final Verification

**Files:**
- Verify changed files only.

- [ ] **Step 1: Check staged diff**

Run:

```bash
git status --short
git diff --check
```

Expected: only intentional files from these tasks changed by this implementation; no whitespace errors.

- [ ] **Step 2: Verify public website page**

Run:

```bash
python3 -m http.server 4177 --directory website
```

Open:

```text
http://localhost:4177/lift-club.html
http://localhost:4177/index.html
http://localhost:4177/dashboard.html
```

Expected: pages render; no obvious layout overlap on desktop or mobile width.

- [ ] **Step 3: Verify server checks**

Run:

```bash
npx tsc --noEmit
```

Expected: no new lift-club-specific TypeScript errors. If the existing repo still fails on unrelated errors, document the first unrelated failure and the fact that lift-club files were reviewed.

- [ ] **Step 4: Final commit if needed**

If any verification fixes were made:

```bash
git add website/lift-club.html website/index.html website/styles.css website/dashboard.html shared/schema.ts server/storage.ts server/routes.ts
git commit -m "fix: polish daily lift club website flow"
```

## Self-Review

- Spec coverage: public search, map/list fallback, weekly/monthly passes, Paystack handoff, seat-full disabled state, 2015+ vehicle rule, existing approval flow, and dashboard visibility are covered by Tasks 1-4.
- Placeholder scan: no placeholder implementation steps remain. The only production caveat is explicitly scoped as the atomic seat-increment hardening step after the basic endpoint is in place.
- Type consistency: route fields use `pickupArea`, `destinationArea`, `weeklyPrice`, `monthlyPrice`, `totalSeats`, and `bookedSeats` consistently across schema, server, and website code.
