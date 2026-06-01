# Daily Lift Club Website Design

## Goal

Add a public Daily Lift Club service to the A2B Lift website where riders can search verified weekday commute vehicles, view matching cars on a map, and reserve a weekly or monthly seat with Paystack. The feature must reuse the existing A2B driver approval flow and admin dashboard vetting. It must not introduce a separate driver signup or trust process.

## First Release Scope

- Add a public website entry point for "Daily Lift Club".
- Let riders search by pickup/current area and workplace/destination.
- Show matching lift club cars/routes in a list and on a map.
- Show driver, vehicle, vehicle year, pickup area, destination/workplace, departure window, weekly price, monthly price, total seats, booked seats, and remaining seats.
- Disable booking when remaining seats are zero and show the listing as full.
- Allow riders to select a weekly pass or monthly pass.
- Send riders through Paystack before confirming the seat.
- Allow only vehicles from 2015 onwards to appear in public lift club listings.
- Require drivers and vehicles to already be approved through the existing driver/admin approval flow.

## Out of Scope for First Release

- A separate lift club driver registration flow.
- Weekend lift club subscriptions.
- Unverified public driver submissions that go live immediately.
- Seat trading or rider-to-rider transfers.
- Corporate invoicing for lift club seats.
- Automatic route matching beyond area/destination search.

## User Experience

### Public Website

The website should add "Daily Lift Club" to the main navigation and service grid. The page should explain the weekday commute model briefly, then make search the primary action. Riders enter where they are starting from and where they work. The page returns matching verified cars and shows them on a map.

Each listing should make trust and availability obvious:

- Driver verification status.
- Vehicle model and year.
- Route or pickup corridor.
- Workplace/destination area.
- Weekly and monthly price.
- Remaining seats.
- Full state when the vehicle has no seats left.

### Booking Flow

Riders choose a listing, select either:

- Weekly pass: 5 weekday trips, excluding weekends.
- Monthly pass: weekday commute access for the selected month period.

The booking remains pending until Paystack confirms payment. After successful payment, the seat count is updated. If the car is already full by the time payment is confirmed, the booking must not be confirmed and the rider should be told the seat is no longer available.

### Dashboard

Logged-in riders should be able to see active lift club bookings in the existing website dashboard. Drivers should use the existing driver approval and dashboard/admin-backed flow. The first release can link drivers to the existing driver registration page rather than adding a new lift club-specific driver form.

## Driver And Vehicle Eligibility

Daily Lift Club listings can only go public when all of these are true:

- Driver account is approved through the existing A2B driver vetting flow.
- Vehicle is approved through the existing admin dashboard.
- Vehicle year is 2015 or newer.
- Route has been reviewed or marked active by A2B/admin.
- Total available public seats is greater than zero.

If any requirement fails, the route should stay hidden from public search.

## Data Model

The backend should model Daily Lift Club separately from long-distance trips because the subscription period, seat lifecycle, and recurring weekday behavior are different.

Suggested entities:

- `lift_club_routes`: approved commute routes created by verified drivers or admins.
- `lift_club_bookings`: rider reservations for weekly or monthly seats.
- `lift_club_payments`: Paystack payment records and webhook state.

Important route fields:

- `driver_id`
- `vehicle_id`
- `pickup_area`
- `destination_area`
- `pickup_lat`
- `pickup_lng`
- `destination_lat`
- `destination_lng`
- `departure_time_window`
- `weekly_price`
- `monthly_price`
- `total_seats`
- `booked_seats`
- `status`

Important booking fields:

- `route_id`
- `rider_id`
- `pass_type`
- `start_date`
- `end_date`
- `seat_count`
- `amount`
- `payment_status`
- `booking_status`
- `paystack_reference`

## API Design

Suggested endpoints:

- `GET /api/lift-club/routes`: public search endpoint for approved and available routes.
- `GET /api/lift-club/routes/:id`: public listing detail.
- `POST /api/lift-club/bookings`: authenticated booking intent, creates pending booking and Paystack initialization.
- `POST /api/lift-club/paystack/webhook`: confirms or rejects payment and finalizes seat allocation.
- Admin/dashboard endpoints for route approval should reuse the existing admin authentication and approval patterns.

Seat allocation must be confirmed server-side after payment verification, using a transaction or equivalent locking so two riders cannot take the last seat at the same time.

## Payment Rules

- Paystack initializes payment for weekly or monthly pass amount.
- Seat is not confirmed until Paystack verifies payment.
- Server must verify Paystack webhooks instead of trusting client redirects.
- If payment succeeds but seat allocation fails because the vehicle is full, the system must mark the booking for refund/manual support and not overbook the car.

## Map Behavior

The public page should use the existing website map/autocomplete approach where possible. Search results should show matching pickup and destination points. The map should focus on the searched area and update when filters change. If Google Maps fails to load, the page should still show the searchable listing cards.

## Safety And Trust

The website should clearly say that Daily Lift Club drivers and vehicles are verified by A2B before routes are listed. It should not imply that any public car owner can appear instantly. Public driver acquisition copy can invite car owners to register, but the call to action should route them into the existing driver registration flow.

## Testing And Verification

Initial implementation should verify:

- Public page loads on desktop and mobile.
- Search results filter by pickup and destination text.
- Full vehicles cannot be booked.
- Weekly and monthly pass selection affects the Paystack amount.
- Vehicle years before 2015 are excluded from public results.
- Dashboard shows active rider lift club bookings.
- Existing website pages still render and navigation works.

## Rollout Suggestion

Start with controlled routes in high-demand commute corridors such as Sandton, Midrand, Rosebank, Fourways, Pretoria, and Johannesburg CBD. Let admins approve a small number of verified drivers first, then expand once seat utilization, refunds, and rider support are stable.
