"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc3) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc3 = __getOwnPropDesc(from, key)) || desc3.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/index.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"));

// server/routes.ts
var import_node_http = require("node:http");
var import_socket = require("socket.io");
var import_axios = __toESM(require("axios"));
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_node_crypto = __toESM(require("node:crypto"));

// server/storage.ts
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");
var import_drizzle_orm2 = require("drizzle-orm");

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  chauffeurs: () => chauffeurs,
  documents: () => documents,
  driverApplications: () => driverApplications,
  earnings: () => earnings,
  fleetDriverInvites: () => fleetDriverInvites,
  insertChauffeurSchema: () => insertChauffeurSchema,
  insertLivenessSessionSchema: () => insertLivenessSessionSchema,
  insertOperatorProfileSchema: () => insertOperatorProfileSchema,
  insertPartnerProfileSchema: () => insertPartnerProfileSchema,
  insertRideSchema: () => insertRideSchema,
  insertUserSchema: () => insertUserSchema,
  insertVehicleAssignmentSchema: () => insertVehicleAssignmentSchema,
  insertVehicleSchema: () => insertVehicleSchema,
  liftClubBookings: () => liftClubBookings,
  liftClubMemberships: () => liftClubMemberships,
  liftClubRoutes: () => liftClubRoutes,
  livenessSessions: () => livenessSessions,
  messages: () => messages,
  notifications: () => notifications,
  operatorProfiles: () => operatorProfiles,
  partnerProfiles: () => partnerProfiles,
  passwordResetTokens: () => passwordResetTokens,
  payments: () => payments,
  referralEvents: () => referralEvents,
  rewardCashouts: () => rewardCashouts,
  rewardTransactions: () => rewardTransactions,
  rideRatings: () => rideRatings,
  rides: () => rides,
  safetyReports: () => safetyReports,
  savedCards: () => savedCards,
  tripEnquiries: () => tripEnquiries,
  users: () => users,
  vehicleAssignments: () => vehicleAssignments,
  vehicles: () => vehicles,
  walletTransactions: () => walletTransactions,
  withdrawals: () => withdrawals
});
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var import_drizzle_zod = require("drizzle-zod");
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  username: (0, import_pg_core.text)("username").notNull().unique(),
  password: (0, import_pg_core.text)("password").notNull(),
  name: (0, import_pg_core.text)("name").notNull(),
  phone: (0, import_pg_core.text)("phone"),
  profilePhoto: (0, import_pg_core.text)("profile_photo"),
  pushToken: (0, import_pg_core.text)("push_token"),
  // client (passenger) | chauffeur (driver) | admin
  role: (0, import_pg_core.text)("role").notNull().default("client"),
  rating: (0, import_pg_core.real)("rating").default(5),
  rewardsBalance: (0, import_pg_core.real)("rewards_balance").default(0),
  referralCode: (0, import_pg_core.text)("referral_code").unique(),
  referredByUserId: (0, import_pg_core.varchar)("referred_by_user_id").references(() => users.id),
  walletBalance: (0, import_pg_core.real)("wallet_balance").default(0),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var chauffeurs = (0, import_pg_core.pgTable)("chauffeurs", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().unique().references(() => users.id),
  carMake: (0, import_pg_core.text)("car_make"),
  vehicleModel: (0, import_pg_core.text)("vehicle_model"),
  vehicleYear: (0, import_pg_core.integer)("vehicle_year"),
  plateNumber: (0, import_pg_core.text)("plate_number"),
  vehicleType: (0, import_pg_core.text)("vehicle_type"),
  carColor: (0, import_pg_core.text)("car_color"),
  phone: (0, import_pg_core.text)("phone"),
  passengerCapacity: (0, import_pg_core.integer)("passenger_capacity").default(4),
  luggageCapacity: (0, import_pg_core.integer)("luggage_capacity").default(2),
  isOnline: (0, import_pg_core.boolean)("is_online").default(false),
  isApproved: (0, import_pg_core.boolean)("is_approved").default(false),
  availableForLongDistance: (0, import_pg_core.boolean)("available_for_long_distance").default(false),
  longDistanceFrom: (0, import_pg_core.text)("long_distance_from"),
  longDistanceTo: (0, import_pg_core.text)("long_distance_to"),
  longDistanceDate: (0, import_pg_core.text)("long_distance_date"),
  longDistancePricePerSeat: (0, import_pg_core.real)("long_distance_price_per_seat"),
  longDistanceSeatsAvailable: (0, import_pg_core.integer)("long_distance_seats_available").default(0),
  earningsTotal: (0, import_pg_core.real)("earnings_total").default(0),
  profilePhoto: (0, import_pg_core.text)("profile_photo"),
  lat: (0, import_pg_core.real)("lat"),
  lng: (0, import_pg_core.real)("lng"),
  locationUpdatedAt: (0, import_pg_core.timestamp)("location_updated_at"),
  pushToken: (0, import_pg_core.text)("push_token"),
  activeVehicleId: (0, import_pg_core.varchar)("active_vehicle_id").references(() => vehicles.id),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var rides = (0, import_pg_core.pgTable)("rides", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  clientId: (0, import_pg_core.varchar)("client_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  vehicleId: (0, import_pg_core.varchar)("vehicle_id").references(() => vehicles.id),
  pickupLat: (0, import_pg_core.real)("pickup_lat").notNull(),
  pickupLng: (0, import_pg_core.real)("pickup_lng").notNull(),
  pickupAddress: (0, import_pg_core.text)("pickup_address"),
  dropoffLat: (0, import_pg_core.real)("dropoff_lat").notNull(),
  dropoffLng: (0, import_pg_core.real)("dropoff_lng").notNull(),
  dropoffAddress: (0, import_pg_core.text)("dropoff_address"),
  status: (0, import_pg_core.text)("status").notNull().default("requested"),
  price: (0, import_pg_core.real)("price"),
  pricePerKm: (0, import_pg_core.real)("price_per_km"),
  baseFare: (0, import_pg_core.real)("base_fare"),
  distanceKm: (0, import_pg_core.real)("distance_km"),
  durationMin: (0, import_pg_core.real)("duration_min"),
  vehicleType: (0, import_pg_core.text)("vehicle_type"),
  dispatchStartedAt: (0, import_pg_core.timestamp)("dispatch_started_at"),
  currentOfferedChauffeurId: (0, import_pg_core.varchar)("current_offered_chauffeur_id").references(() => chauffeurs.id),
  currentOfferExpiresAt: (0, import_pg_core.timestamp)("current_offer_expires_at"),
  acceptedAt: (0, import_pg_core.timestamp)("accepted_at"),
  tripStartedAt: (0, import_pg_core.timestamp)("trip_started_at"),
  cancelledBy: (0, import_pg_core.text)("cancelled_by"),
  cancellationFee: (0, import_pg_core.real)("cancellation_fee").notNull().default(0),
  surgeMultiplier: (0, import_pg_core.real)("surge_multiplier").default(1),
  surgeReason: (0, import_pg_core.text)("surge_reason"),
  estimatedDurationMin: (0, import_pg_core.real)("estimated_duration_min"),
  actualDurationMin: (0, import_pg_core.real)("actual_duration_min"),
  perMinuteAdjustment: (0, import_pg_core.real)("per_minute_adjustment").default(0),
  paymentMethod: (0, import_pg_core.text)("payment_method").default("cash"),
  paymentStatus: (0, import_pg_core.text)("payment_status").notNull().default("unpaid"),
  // unpaid|pending|paid|failed|refunded
  cashSelfieUrl: (0, import_pg_core.text)("cash_selfie_url"),
  livenessStatus: (0, import_pg_core.text)("liveness_status").default("not_required"),
  // not_required|pending|passed|failed
  livenessProvider: (0, import_pg_core.text)("liveness_provider"),
  livenessSessionId: (0, import_pg_core.varchar)("liveness_session_id"),
  livenessScore: (0, import_pg_core.real)("liveness_score"),
  livenessVerifiedAt: (0, import_pg_core.timestamp)("liveness_verified_at"),
  // Route selection (set when driver picks fastest/shortest/least-traffic route)
  selectedRouteId: (0, import_pg_core.text)("selected_route_id"),
  selectedRouteDistanceKm: (0, import_pg_core.real)("selected_route_distance_km"),
  actualFare: (0, import_pg_core.real)("actual_fare"),
  demandMultiplier: (0, import_pg_core.real)("demand_multiplier").notNull().default(1),
  quotedFare: (0, import_pg_core.real)("quoted_fare"),
  finalFare: (0, import_pg_core.real)("final_fare"),
  actualDistanceKm: (0, import_pg_core.real)("actual_distance_km"),
  waitingFee: (0, import_pg_core.real)("waiting_fee").notNull().default(0),
  settlementStatus: (0, import_pg_core.text)("settlement_status").notNull().default("quoted"),
  pickupTravelStartedAt: (0, import_pg_core.timestamp)("pickup_travel_started_at"),
  arrivedAt: (0, import_pg_core.timestamp)("arrived_at"),
  routeCurrency: (0, import_pg_core.text)("route_currency").default("ZAR"),
  routeSelectedAt: (0, import_pg_core.timestamp)("route_selected_at"),
  rewardsAmountUsed: (0, import_pg_core.real)("rewards_amount_used").default(0),
  // Reservations: rider books in advance; status stays "reserved" until dispatch time
  scheduledFor: (0, import_pg_core.timestamp)("scheduled_for"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  completedAt: (0, import_pg_core.timestamp)("completed_at")
});
var livenessSessions = (0, import_pg_core.pgTable)("liveness_sessions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  provider: (0, import_pg_core.text)("provider").notNull().default("mock"),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|passed|failed|expired
  challengeCode: (0, import_pg_core.text)("challenge_code").notNull(),
  selfieUrl: (0, import_pg_core.text)("selfie_url"),
  verifiedPhotoUrl: (0, import_pg_core.text)("verified_photo_url"),
  rideId: (0, import_pg_core.varchar)("ride_id"),
  score: (0, import_pg_core.real)("score"),
  attempts: (0, import_pg_core.integer)("attempts").notNull().default(0),
  maxAttempts: (0, import_pg_core.integer)("max_attempts").notNull().default(3),
  errorReason: (0, import_pg_core.text)("error_reason"),
  expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
  verifiedAt: (0, import_pg_core.timestamp)("verified_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var payments = (0, import_pg_core.pgTable)("payments", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  payerUserId: (0, import_pg_core.varchar)("payer_user_id").notNull().references(() => users.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  method: (0, import_pg_core.text)("method").notNull().default("cash"),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|paid|failed|refunded
  currency: (0, import_pg_core.text)("currency").default("ZAR"),
  provider: (0, import_pg_core.text)("provider"),
  providerRef: (0, import_pg_core.text)("provider_ref"),
  paystackReference: (0, import_pg_core.varchar)("paystack_reference"),
  paystackAuthCode: (0, import_pg_core.text)("paystack_auth_code"),
  paidAt: (0, import_pg_core.timestamp)("paid_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var driverApplications = (0, import_pg_core.pgTable)("driver_applications", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  // pending|approved|rejected
  notes: (0, import_pg_core.text)("notes"),
  submittedAt: (0, import_pg_core.timestamp)("submitted_at").defaultNow(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id)
});
var operatorProfiles = (0, import_pg_core.pgTable)("operator_profiles", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().unique().references(() => users.id),
  type: (0, import_pg_core.text)("type").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("draft"),
  rejectionReason: (0, import_pg_core.text)("rejection_reason"),
  submittedAt: (0, import_pg_core.timestamp)("submitted_at"),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var partnerProfiles = (0, import_pg_core.pgTable)("partner_profiles", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  operatorProfileId: (0, import_pg_core.varchar)("operator_profile_id").notNull().unique().references(() => operatorProfiles.id),
  companyName: (0, import_pg_core.text)("company_name").notNull(),
  registrationNumber: (0, import_pg_core.text)("registration_number").notNull(),
  contactPersonName: (0, import_pg_core.text)("contact_person_name").notNull(),
  contactPhone: (0, import_pg_core.text)("contact_phone").notNull(),
  contactEmail: (0, import_pg_core.text)("contact_email").notNull(),
  bankName: (0, import_pg_core.text)("bank_name").notNull(),
  accountHolder: (0, import_pg_core.text)("account_holder").notNull(),
  accountNumber: (0, import_pg_core.text)("account_number").notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var vehicles = (0, import_pg_core.pgTable)("vehicles", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  ownerOperatorProfileId: (0, import_pg_core.varchar)("owner_operator_profile_id").notNull().references(() => operatorProfiles.id),
  status: (0, import_pg_core.text)("status").notNull().default("draft"),
  carMake: (0, import_pg_core.text)("car_make").notNull(),
  vehicleModel: (0, import_pg_core.text)("vehicle_model").notNull(),
  vehicleYear: (0, import_pg_core.integer)("vehicle_year").notNull(),
  plateNumber: (0, import_pg_core.text)("plate_number").notNull(),
  vehicleType: (0, import_pg_core.text)("vehicle_type").notNull(),
  carColor: (0, import_pg_core.text)("car_color").notNull(),
  passengerCapacity: (0, import_pg_core.integer)("passenger_capacity").default(4),
  luggageCapacity: (0, import_pg_core.integer)("luggage_capacity").default(2),
  rejectionReason: (0, import_pg_core.text)("rejection_reason"),
  submittedAt: (0, import_pg_core.timestamp)("submitted_at"),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var vehicleAssignments = (0, import_pg_core.pgTable)("vehicle_assignments", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  vehicleId: (0, import_pg_core.varchar)("vehicle_id").notNull().references(() => vehicles.id),
  driverOperatorProfileId: (0, import_pg_core.varchar)("driver_operator_profile_id").notNull().references(() => operatorProfiles.id),
  assignedByOperatorProfileId: (0, import_pg_core.varchar)("assigned_by_operator_profile_id").notNull().references(() => operatorProfiles.id),
  status: (0, import_pg_core.text)("status").notNull().default("active"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  removedAt: (0, import_pg_core.timestamp)("removed_at")
});
var fleetDriverInvites = (0, import_pg_core.pgTable)("fleet_driver_invites", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  driverOperatorProfileId: (0, import_pg_core.varchar)("driver_operator_profile_id").notNull().references(() => operatorProfiles.id),
  invitedByOperatorProfileId: (0, import_pg_core.varchar)("invited_by_operator_profile_id").notNull().references(() => operatorProfiles.id),
  invitedByUserId: (0, import_pg_core.varchar)("invited_by_user_id").notNull().references(() => users.id),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  emailStatus: (0, import_pg_core.text)("email_status").notNull().default("queued"),
  emailError: (0, import_pg_core.text)("email_error"),
  message: (0, import_pg_core.text)("message"),
  resendId: (0, import_pg_core.text)("resend_id"),
  sentAt: (0, import_pg_core.timestamp)("sent_at"),
  acceptedAt: (0, import_pg_core.timestamp)("accepted_at"),
  declinedAt: (0, import_pg_core.timestamp)("declined_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var passwordResetTokens = (0, import_pg_core.pgTable)("password_reset_tokens", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  tokenHash: (0, import_pg_core.text)("token_hash").notNull().unique(),
  expiresAt: (0, import_pg_core.timestamp)("expires_at").notNull(),
  usedAt: (0, import_pg_core.timestamp)("used_at"),
  requestedAt: (0, import_pg_core.timestamp)("requested_at").defaultNow(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var liftClubRoutes = (0, import_pg_core.pgTable)("lift_club_routes", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  vehicleId: (0, import_pg_core.varchar)("vehicle_id").notNull().references(() => vehicles.id),
  pickupArea: (0, import_pg_core.text)("pickup_area").notNull(),
  destinationArea: (0, import_pg_core.text)("destination_area").notNull(),
  pickupLat: (0, import_pg_core.real)("pickup_lat"),
  pickupLng: (0, import_pg_core.real)("pickup_lng"),
  destinationLat: (0, import_pg_core.real)("destination_lat"),
  destinationLng: (0, import_pg_core.real)("destination_lng"),
  departureWindow: (0, import_pg_core.text)("departure_window").notNull().default("Weekday mornings"),
  weeklyPrice: (0, import_pg_core.real)("weekly_price").notNull(),
  monthlyPrice: (0, import_pg_core.real)("monthly_price").notNull(),
  totalSeats: (0, import_pg_core.integer)("total_seats").notNull().default(1),
  bookedSeats: (0, import_pg_core.integer)("booked_seats").notNull().default(0),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var liftClubBookings = (0, import_pg_core.pgTable)("lift_club_bookings", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  routeId: (0, import_pg_core.varchar)("route_id").notNull().references(() => liftClubRoutes.id),
  riderId: (0, import_pg_core.varchar)("rider_id").notNull().references(() => users.id),
  passType: (0, import_pg_core.text)("pass_type").notNull(),
  startDate: (0, import_pg_core.text)("start_date").notNull(),
  endDate: (0, import_pg_core.text)("end_date").notNull(),
  seatCount: (0, import_pg_core.integer)("seat_count").notNull().default(1),
  amount: (0, import_pg_core.real)("amount").notNull(),
  paymentStatus: (0, import_pg_core.text)("payment_status").notNull().default("pending"),
  bookingStatus: (0, import_pg_core.text)("booking_status").notNull().default("pending"),
  paystackReference: (0, import_pg_core.varchar)("paystack_reference"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  confirmedAt: (0, import_pg_core.timestamp)("confirmed_at")
});
var documents = (0, import_pg_core.pgTable)("documents", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  applicationId: (0, import_pg_core.varchar)("application_id").references(() => driverApplications.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  vehicleId: (0, import_pg_core.varchar)("vehicle_id").references(() => vehicles.id),
  type: (0, import_pg_core.text)("type").notNull(),
  url: (0, import_pg_core.text)("url").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  reviewReason: (0, import_pg_core.text)("review_reason"),
  uploadedAt: (0, import_pg_core.timestamp)("uploaded_at").defaultNow(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id)
});
var liftClubMemberships = (0, import_pg_core.pgTable)("lift_club_memberships", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().unique().references(() => users.id),
  status: (0, import_pg_core.text)("status").notNull().default("pending_payment"),
  feeAmount: (0, import_pg_core.real)("fee_amount").notNull().default(200),
  proofDocumentId: (0, import_pg_core.varchar)("proof_document_id").references(() => documents.id),
  rejectionReason: (0, import_pg_core.text)("rejection_reason"),
  submittedAt: (0, import_pg_core.timestamp)("submitted_at").defaultNow(),
  paidAt: (0, import_pg_core.timestamp)("paid_at"),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  reviewerAdminId: (0, import_pg_core.varchar)("reviewer_admin_id").references(() => users.id),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var rideRatings = (0, import_pg_core.pgTable)("ride_ratings", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  clientId: (0, import_pg_core.varchar)("client_id").notNull().references(() => users.id),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  rating: (0, import_pg_core.integer)("rating").notNull(),
  comment: (0, import_pg_core.text)("comment"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var earnings = (0, import_pg_core.pgTable)("earnings", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").notNull().references(() => chauffeurs.id),
  rideId: (0, import_pg_core.varchar)("ride_id").references(() => rides.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  commission: (0, import_pg_core.real)("commission").notNull(),
  type: (0, import_pg_core.text)("type"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var withdrawals = (0, import_pg_core.pgTable)("withdrawals", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  chauffeurId: (0, import_pg_core.varchar)("chauffeur_id").references(() => chauffeurs.id),
  userId: (0, import_pg_core.varchar)("user_id").references(() => users.id),
  source: (0, import_pg_core.text)("source"),
  // "driver_earnings" | "wallet"
  amount: (0, import_pg_core.real)("amount").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("pending"),
  bankName: (0, import_pg_core.text)("bank_name"),
  accountNumber: (0, import_pg_core.text)("account_number"),
  accountHolder: (0, import_pg_core.text)("account_holder"),
  paystackTransferCode: (0, import_pg_core.varchar)("paystack_transfer_code"),
  paystackRecipientCode: (0, import_pg_core.varchar)("paystack_recipient_code"),
  processedAt: (0, import_pg_core.timestamp)("processed_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var messages = (0, import_pg_core.pgTable)("messages", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  senderId: (0, import_pg_core.varchar)("sender_id").notNull().references(() => users.id),
  messageText: (0, import_pg_core.text)("message_text").notNull(),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var safetyReports = (0, import_pg_core.pgTable)("safety_reports", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  rideId: (0, import_pg_core.varchar)("ride_id").references(() => rides.id),
  type: (0, import_pg_core.text)("type").notNull(),
  description: (0, import_pg_core.text)("description").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("open"),
  aiResponse: (0, import_pg_core.text)("ai_response"),
  priority: (0, import_pg_core.text)("priority").default("medium"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var notifications = (0, import_pg_core.pgTable)("notifications", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  title: (0, import_pg_core.text)("title").notNull(),
  body: (0, import_pg_core.text)("body").notNull(),
  type: (0, import_pg_core.text)("type").notNull().default("general"),
  isRead: (0, import_pg_core.boolean)("is_read").default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var tripEnquiries = (0, import_pg_core.pgTable)("trip_enquiries", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  rideId: (0, import_pg_core.varchar)("ride_id").notNull().references(() => rides.id),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  message: (0, import_pg_core.text)("message").notNull(),
  adminReply: (0, import_pg_core.text)("admin_reply"),
  status: (0, import_pg_core.text)("status").notNull().default("open"),
  // open | replied | closed
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  repliedAt: (0, import_pg_core.timestamp)("replied_at")
});
var savedCards = (0, import_pg_core.pgTable)("saved_cards", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  paystackAuthCode: (0, import_pg_core.text)("paystack_auth_code").notNull(),
  cardType: (0, import_pg_core.text)("card_type"),
  last4: (0, import_pg_core.varchar)("last4", { length: 4 }),
  expMonth: (0, import_pg_core.varchar)("exp_month", { length: 2 }),
  expYear: (0, import_pg_core.varchar)("exp_year", { length: 4 }),
  bank: (0, import_pg_core.text)("bank"),
  isDefault: (0, import_pg_core.boolean)("is_default").default(false),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var walletTransactions = (0, import_pg_core.pgTable)("wallet_transactions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  type: (0, import_pg_core.text)("type").notNull(),
  amount: (0, import_pg_core.real)("amount").notNull(),
  balanceBefore: (0, import_pg_core.real)("balance_before").notNull(),
  balanceAfter: (0, import_pg_core.real)("balance_after").notNull(),
  reference: (0, import_pg_core.varchar)("reference"),
  description: (0, import_pg_core.text)("description"),
  rideId: (0, import_pg_core.varchar)("ride_id"),
  status: (0, import_pg_core.text)("status").default("completed"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var insertUserSchema = (0, import_drizzle_zod.createInsertSchema)(users).pick({
  username: true,
  password: true,
  name: true,
  phone: true,
  role: true
});
var insertChauffeurSchema = (0, import_drizzle_zod.createInsertSchema)(chauffeurs).pick({
  userId: true,
  carMake: true,
  vehicleModel: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  phone: true,
  passengerCapacity: true,
  luggageCapacity: true
});
var insertRideSchema = (0, import_drizzle_zod.createInsertSchema)(rides).pick({
  clientId: true,
  pickupLat: true,
  pickupLng: true,
  pickupAddress: true,
  dropoffLat: true,
  dropoffLng: true,
  dropoffAddress: true,
  vehicleType: true,
  paymentMethod: true,
  cashSelfieUrl: true,
  livenessStatus: true,
  livenessProvider: true,
  livenessSessionId: true,
  livenessScore: true,
  livenessVerifiedAt: true
});
var insertLivenessSessionSchema = (0, import_drizzle_zod.createInsertSchema)(livenessSessions).pick({
  userId: true,
  provider: true,
  status: true,
  challengeCode: true,
  selfieUrl: true,
  score: true,
  attempts: true,
  maxAttempts: true,
  errorReason: true,
  expiresAt: true,
  verifiedAt: true
});
var insertOperatorProfileSchema = (0, import_drizzle_zod.createInsertSchema)(operatorProfiles).pick({
  userId: true,
  type: true,
  status: true,
  rejectionReason: true,
  submittedAt: true
});
var insertPartnerProfileSchema = (0, import_drizzle_zod.createInsertSchema)(partnerProfiles).pick({
  operatorProfileId: true,
  companyName: true,
  registrationNumber: true,
  contactPersonName: true,
  contactPhone: true,
  contactEmail: true,
  bankName: true,
  accountHolder: true,
  accountNumber: true
});
var insertVehicleSchema = (0, import_drizzle_zod.createInsertSchema)(vehicles).pick({
  ownerOperatorProfileId: true,
  status: true,
  carMake: true,
  vehicleModel: true,
  vehicleYear: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  passengerCapacity: true,
  luggageCapacity: true
});
var insertVehicleAssignmentSchema = (0, import_drizzle_zod.createInsertSchema)(vehicleAssignments).pick({
  vehicleId: true,
  driverOperatorProfileId: true,
  assignedByOperatorProfileId: true,
  status: true
});
var referralEvents = (0, import_pg_core.pgTable)("referral_events", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  referrerUserId: (0, import_pg_core.varchar)("referrer_user_id").notNull().references(() => users.id),
  referredUserId: (0, import_pg_core.varchar)("referred_user_id").notNull().unique().references(() => users.id),
  referralCodeUsed: (0, import_pg_core.text)("referral_code_used").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("registered"),
  totalRewards: (0, import_pg_core.real)("total_rewards").default(0),
  firstRewardAt: (0, import_pg_core.timestamp)("first_reward_at"),
  lastRewardAt: (0, import_pg_core.timestamp)("last_reward_at"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow(),
  updatedAt: (0, import_pg_core.timestamp)("updated_at").defaultNow()
});
var rewardTransactions = (0, import_pg_core.pgTable)("reward_transactions", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  referralEventId: (0, import_pg_core.varchar)("referral_event_id").references(() => referralEvents.id),
  sourceUserId: (0, import_pg_core.varchar)("source_user_id").references(() => users.id),
  rideId: (0, import_pg_core.varchar)("ride_id").references(() => rides.id),
  reference: (0, import_pg_core.varchar)("reference"),
  amount: (0, import_pg_core.real)("amount").notNull(),
  balanceBefore: (0, import_pg_core.real)("balance_before").notNull(),
  balanceAfter: (0, import_pg_core.real)("balance_after").notNull(),
  type: (0, import_pg_core.text)("type").notNull(),
  description: (0, import_pg_core.text)("description"),
  status: (0, import_pg_core.text)("status").notNull().default("completed"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var rewardCashouts = (0, import_pg_core.pgTable)("reward_cashouts", {
  id: (0, import_pg_core.varchar)("id").primaryKey().default(import_drizzle_orm.sql`gen_random_uuid()`),
  userId: (0, import_pg_core.varchar)("user_id").notNull().references(() => users.id),
  amount: (0, import_pg_core.real)("amount").notNull(),
  status: (0, import_pg_core.text)("status").notNull().default("requested"),
  bankName: (0, import_pg_core.text)("bank_name"),
  accountNumber: (0, import_pg_core.text)("account_number"),
  accountHolder: (0, import_pg_core.text)("account_holder"),
  phone: (0, import_pg_core.text)("phone"),
  notes: (0, import_pg_core.text)("notes"),
  reviewedByAdminId: (0, import_pg_core.varchar)("reviewed_by_admin_id").references(() => users.id),
  requestedAt: (0, import_pg_core.timestamp)("requested_at").defaultNow(),
  reviewedAt: (0, import_pg_core.timestamp)("reviewed_at"),
  paidAt: (0, import_pg_core.timestamp)("paid_at")
});

// server/storage.ts
var dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL is not set");
}
console.log(`[Storage] Using DB: ${dbUrl.includes("supabase") ? "SUPABASE \u2705" : "LOCAL \u274C"} | ${dbUrl.replace(/:([^:@]+)@/, ":***@")}`);
var requireSsl = dbUrl.includes("supabase") || dbUrl.includes("neon.tech");
var pool = new import_pg.Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false
});
var db = (0, import_node_postgres.drizzle)(pool);
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.id, id));
    return user;
  }
  async getUserByUsername(username) {
    const normalised = username.toLowerCase().trim();
    const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.username, normalised));
    return user;
  }
  async getUserByReferralCode(referralCode) {
    const code = referralCode.trim().toUpperCase();
    const [user] = await db.select().from(users).where((0, import_drizzle_orm2.eq)(users.referralCode, code));
    return user;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async updateUser(id, data) {
    const [user] = await db.update(users).set(data).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return user;
  }
  async getChauffeur(id) {
    const [chauffeur] = await db.select().from(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id));
    return chauffeur;
  }
  async getChauffeurByUserId(userId) {
    const [chauffeur] = await db.select().from(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.userId, userId));
    return chauffeur;
  }
  async createChauffeur(data) {
    const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
    return chauffeur;
  }
  async updateChauffeur(id, data) {
    const sanitizedEntries = Object.entries(data || {}).filter(([, value]) => value !== void 0);
    if (sanitizedEntries.length === 0) {
      return this.getChauffeur(id);
    }
    const sanitizedData = Object.fromEntries(sanitizedEntries);
    const [chauffeur] = await db.update(chauffeurs).set(sanitizedData).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id)).returning();
    return chauffeur;
  }
  async deleteChauffeur(id) {
    const deleted = await db.delete(chauffeurs).where((0, import_drizzle_orm2.eq)(chauffeurs.id, id)).returning();
    return deleted.length > 0;
  }
  async getOnlineChauffeurs() {
    return db.select().from(chauffeurs).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(chauffeurs.isOnline, true), (0, import_drizzle_orm2.eq)(chauffeurs.isApproved, true)));
  }
  async getAllChauffeurs() {
    return db.select().from(chauffeurs).orderBy((0, import_drizzle_orm2.desc)(chauffeurs.createdAt));
  }
  async createDriverApplication(data) {
    const [app2] = await db.insert(driverApplications).values(data).returning();
    return app2;
  }
  async getDriverApplication(id) {
    const [app2] = await db.select().from(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.id, id));
    return app2;
  }
  async getDriverApplications() {
    return db.select().from(driverApplications).orderBy((0, import_drizzle_orm2.desc)(driverApplications.submittedAt));
  }
  async getDriverApplicationByUserId(userId) {
    const [app2] = await db.select().from(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(driverApplications.submittedAt));
    return app2;
  }
  async updateDriverApplication(id, data) {
    const [app2] = await db.update(driverApplications).set(data).where((0, import_drizzle_orm2.eq)(driverApplications.id, id)).returning();
    return app2;
  }
  async deleteDriverApplication(id) {
    const deleted = await db.delete(driverApplications).where((0, import_drizzle_orm2.eq)(driverApplications.id, id)).returning();
    return deleted.length > 0;
  }
  async getOperatorProfile(id) {
    const [profile] = await db.select().from(operatorProfiles).where((0, import_drizzle_orm2.eq)(operatorProfiles.id, id));
    return profile;
  }
  async getOperatorProfileByUserId(userId) {
    const [profile] = await db.select().from(operatorProfiles).where((0, import_drizzle_orm2.eq)(operatorProfiles.userId, userId));
    return profile;
  }
  async getOperatorProfiles(filters = {}) {
    const conditions = [
      filters.type ? (0, import_drizzle_orm2.eq)(operatorProfiles.type, filters.type) : void 0,
      filters.status ? (0, import_drizzle_orm2.eq)(operatorProfiles.status, filters.status) : void 0
    ].filter(Boolean);
    if (conditions.length > 0) {
      return db.select().from(operatorProfiles).where((0, import_drizzle_orm2.and)(...conditions)).orderBy((0, import_drizzle_orm2.desc)(operatorProfiles.submittedAt));
    }
    return db.select().from(operatorProfiles).orderBy((0, import_drizzle_orm2.desc)(operatorProfiles.submittedAt));
  }
  async createOperatorProfile(data) {
    const [profile] = await db.insert(operatorProfiles).values(data).returning();
    return profile;
  }
  async updateOperatorProfile(id, data) {
    const [profile] = await db.update(operatorProfiles).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(operatorProfiles.id, id)).returning();
    return profile;
  }
  async deleteOperatorProfile(id) {
    const profile = await this.getOperatorProfile(id);
    if (!profile) return false;
    const ownedVehicles = await this.getVehiclesByOwnerOperator(id);
    for (const vehicle of ownedVehicles) {
      await this.deleteVehicle(vehicle.id);
    }
    await db.delete(vehicleAssignments).where(
      (0, import_drizzle_orm2.or)(
        (0, import_drizzle_orm2.eq)(vehicleAssignments.driverOperatorProfileId, id),
        (0, import_drizzle_orm2.eq)(vehicleAssignments.assignedByOperatorProfileId, id)
      )
    );
    await db.delete(fleetDriverInvites).where(
      (0, import_drizzle_orm2.or)(
        (0, import_drizzle_orm2.eq)(fleetDriverInvites.driverOperatorProfileId, id),
        (0, import_drizzle_orm2.eq)(fleetDriverInvites.invitedByOperatorProfileId, id)
      )
    );
    await db.delete(partnerProfiles).where((0, import_drizzle_orm2.eq)(partnerProfiles.operatorProfileId, id));
    await db.delete(documents).where((0, import_drizzle_orm2.eq)(documents.userId, profile.userId));
    const deleted = await db.delete(operatorProfiles).where((0, import_drizzle_orm2.eq)(operatorProfiles.id, id)).returning();
    return deleted.length > 0;
  }
  async getPartnerProfileByOperatorId(operatorProfileId) {
    const [profile] = await db.select().from(partnerProfiles).where((0, import_drizzle_orm2.eq)(partnerProfiles.operatorProfileId, operatorProfileId));
    return profile;
  }
  async createPartnerProfile(data) {
    const [profile] = await db.insert(partnerProfiles).values(data).returning();
    return profile;
  }
  async updatePartnerProfile(id, data) {
    const [profile] = await db.update(partnerProfiles).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(partnerProfiles.id, id)).returning();
    return profile;
  }
  async getVehicle(id) {
    const [vehicle] = await db.select().from(vehicles).where((0, import_drizzle_orm2.eq)(vehicles.id, id));
    return vehicle;
  }
  async getVehiclesByOwnerOperator(ownerOperatorProfileId) {
    return db.select().from(vehicles).where((0, import_drizzle_orm2.eq)(vehicles.ownerOperatorProfileId, ownerOperatorProfileId)).orderBy((0, import_drizzle_orm2.desc)(vehicles.createdAt));
  }
  async getVehicles(filters = {}) {
    const conditions = [
      filters.status ? (0, import_drizzle_orm2.eq)(vehicles.status, filters.status) : void 0,
      filters.ownerOperatorProfileId ? (0, import_drizzle_orm2.eq)(vehicles.ownerOperatorProfileId, filters.ownerOperatorProfileId) : void 0
    ].filter(Boolean);
    if (conditions.length > 0) {
      return db.select().from(vehicles).where((0, import_drizzle_orm2.and)(...conditions)).orderBy((0, import_drizzle_orm2.desc)(vehicles.createdAt));
    }
    return db.select().from(vehicles).orderBy((0, import_drizzle_orm2.desc)(vehicles.createdAt));
  }
  async createVehicle(data) {
    const [vehicle] = await db.insert(vehicles).values(data).returning();
    return vehicle;
  }
  async updateVehicle(id, data) {
    const [vehicle] = await db.update(vehicles).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(vehicles.id, id)).returning();
    return vehicle;
  }
  async deleteVehicle(id) {
    await db.update(chauffeurs).set({ activeVehicleId: null }).where((0, import_drizzle_orm2.eq)(chauffeurs.activeVehicleId, id));
    await db.delete(documents).where((0, import_drizzle_orm2.eq)(documents.vehicleId, id));
    await db.delete(vehicleAssignments).where((0, import_drizzle_orm2.eq)(vehicleAssignments.vehicleId, id));
    const deleted = await db.delete(vehicles).where((0, import_drizzle_orm2.eq)(vehicles.id, id)).returning();
    return deleted.length > 0;
  }
  async getActiveVehicleAssignment(vehicleId, driverOperatorProfileId) {
    const [assignment] = await db.select().from(vehicleAssignments).where((0, import_drizzle_orm2.and)(
      (0, import_drizzle_orm2.eq)(vehicleAssignments.vehicleId, vehicleId),
      (0, import_drizzle_orm2.eq)(vehicleAssignments.driverOperatorProfileId, driverOperatorProfileId),
      (0, import_drizzle_orm2.eq)(vehicleAssignments.status, "active")
    ));
    return assignment;
  }
  async getVehicleAssignments(filters = {}) {
    const conditions = [
      filters.vehicleId ? (0, import_drizzle_orm2.eq)(vehicleAssignments.vehicleId, filters.vehicleId) : void 0,
      filters.driverOperatorProfileId ? (0, import_drizzle_orm2.eq)(vehicleAssignments.driverOperatorProfileId, filters.driverOperatorProfileId) : void 0,
      filters.assignedByOperatorProfileId ? (0, import_drizzle_orm2.eq)(vehicleAssignments.assignedByOperatorProfileId, filters.assignedByOperatorProfileId) : void 0,
      filters.status ? (0, import_drizzle_orm2.eq)(vehicleAssignments.status, filters.status) : void 0
    ].filter(Boolean);
    if (conditions.length > 0) {
      return db.select().from(vehicleAssignments).where((0, import_drizzle_orm2.and)(...conditions)).orderBy((0, import_drizzle_orm2.desc)(vehicleAssignments.createdAt));
    }
    return db.select().from(vehicleAssignments).orderBy((0, import_drizzle_orm2.desc)(vehicleAssignments.createdAt));
  }
  async createVehicleAssignment(data) {
    const [assignment] = await db.insert(vehicleAssignments).values(data).returning();
    return assignment;
  }
  async updateVehicleAssignment(id, data) {
    const [assignment] = await db.update(vehicleAssignments).set(data).where((0, import_drizzle_orm2.eq)(vehicleAssignments.id, id)).returning();
    return assignment;
  }
  async enrichLiftClubRoute(route) {
    const [chauffeur, vehicle] = await Promise.all([
      this.getChauffeur(route.chauffeurId),
      this.getVehicle(route.vehicleId)
    ]);
    if (!chauffeur || !vehicle) return void 0;
    if (!chauffeur.isApproved) return void 0;
    if (vehicle.status !== "approved") return void 0;
    if (Number(vehicle.vehicleYear || 0) < 2015) return void 0;
    const driver = chauffeur.userId ? await this.getUser(chauffeur.userId) : void 0;
    return {
      ...route,
      driverName: driver?.name || "Verified A2B driver",
      driverPhoto: chauffeur.profilePhoto || driver?.profilePhoto || null,
      driverRating: driver?.rating || 5,
      vehicleModel: `${vehicle.carMake || ""} ${vehicle.vehicleModel || ""}`.trim() || chauffeur.vehicleModel || vehicle.vehicleType,
      vehicleType: vehicle.vehicleType,
      vehicleYear: vehicle.vehicleYear,
      vehicleColor: vehicle.carColor,
      plateNumber: vehicle.plateNumber,
      chauffeurUserId: chauffeur.userId
    };
  }
  async searchLiftClubRoutes(filters = {}) {
    const normalizedFrom = String(filters.from || "").trim().toLowerCase();
    const normalizedTo = String(filters.to || "").trim().toLowerCase();
    const rows = await db.select().from(liftClubRoutes).where((0, import_drizzle_orm2.eq)(liftClubRoutes.status, "active")).orderBy((0, import_drizzle_orm2.desc)(liftClubRoutes.createdAt));
    const enriched = await Promise.all(rows.map((route) => this.enrichLiftClubRoute(route)));
    return enriched.filter(Boolean).filter((route) => {
      const fromOk = !normalizedFrom || String(route.pickupArea || "").toLowerCase().includes(normalizedFrom);
      const toOk = !normalizedTo || String(route.destinationArea || "").toLowerCase().includes(normalizedTo);
      return fromOk && toOk;
    });
  }
  async getLiftClubRoute(id) {
    const [route] = await db.select().from(liftClubRoutes).where((0, import_drizzle_orm2.eq)(liftClubRoutes.id, id));
    return route ? this.enrichLiftClubRoute(route) : void 0;
  }
  async getLiftClubRouteByChauffeurId(chauffeurId) {
    const [route] = await db.select().from(liftClubRoutes).where((0, import_drizzle_orm2.eq)(liftClubRoutes.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(liftClubRoutes.updatedAt));
    return route ? this.enrichLiftClubRoute(route) : void 0;
  }
  async getLiftClubRoutes(filters = {}) {
    const rows = await db.select().from(liftClubRoutes).where(filters.status && filters.status !== "all" ? (0, import_drizzle_orm2.eq)(liftClubRoutes.status, filters.status) : import_drizzle_orm2.sql`true`).orderBy((0, import_drizzle_orm2.desc)(liftClubRoutes.updatedAt), (0, import_drizzle_orm2.desc)(liftClubRoutes.createdAt));
    const enriched = await Promise.all(rows.map((route) => this.enrichLiftClubRoute(route)));
    return enriched.filter(Boolean);
  }
  async upsertLiftClubRoute(data) {
    const [existing] = await db.select().from(liftClubRoutes).where((0, import_drizzle_orm2.eq)(liftClubRoutes.chauffeurId, data.chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(liftClubRoutes.updatedAt));
    if (existing) {
      const [route2] = await db.update(liftClubRoutes).set({
        vehicleId: data.vehicleId,
        pickupArea: data.pickupArea,
        destinationArea: data.destinationArea,
        pickupLat: data.pickupLat ?? null,
        pickupLng: data.pickupLng ?? null,
        destinationLat: data.destinationLat ?? null,
        destinationLng: data.destinationLng ?? null,
        departureWindow: data.departureWindow,
        weeklyPrice: data.weeklyPrice,
        monthlyPrice: data.monthlyPrice,
        totalSeats: data.totalSeats,
        bookedSeats: import_drizzle_orm2.sql`LEAST(${liftClubRoutes.bookedSeats}, ${Number(data.totalSeats)})`,
        status: data.status || "active",
        updatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm2.eq)(liftClubRoutes.id, existing.id)).returning();
      return this.enrichLiftClubRoute(route2);
    }
    const [route] = await db.insert(liftClubRoutes).values(data).returning();
    return this.enrichLiftClubRoute(route);
  }
  async updateLiftClubRouteStatus(chauffeurId, status) {
    const [route] = await db.update(liftClubRoutes).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(liftClubRoutes.chauffeurId, chauffeurId)).returning();
    return route ? this.enrichLiftClubRoute(route) : void 0;
  }
  async updateLiftClubRouteStatusById(id, status) {
    const [route] = await db.update(liftClubRoutes).set({ status, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(liftClubRoutes.id, id)).returning();
    return route ? this.enrichLiftClubRoute(route) : void 0;
  }
  async createLiftClubBooking(data) {
    const [booking] = await db.insert(liftClubBookings).values(data).returning();
    return booking;
  }
  async confirmLiftClubBookingWithSeat(data) {
    return db.transaction(async (tx) => {
      const [updatedRoute] = await tx.update(liftClubRoutes).set({
        bookedSeats: import_drizzle_orm2.sql`${liftClubRoutes.bookedSeats} + ${Number(data.seatCount || 1)}`,
        updatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm2.and)(
        (0, import_drizzle_orm2.eq)(liftClubRoutes.id, data.routeId),
        (0, import_drizzle_orm2.eq)(liftClubRoutes.status, "active"),
        import_drizzle_orm2.sql`${liftClubRoutes.bookedSeats} + ${Number(data.seatCount || 1)} <= ${liftClubRoutes.totalSeats}`
      )).returning();
      if (!updatedRoute) {
        throw new Error("This lift club car is already full.");
      }
      const [booking] = await tx.insert(liftClubBookings).values({
        ...data,
        paymentStatus: data.paymentStatus || "paid",
        bookingStatus: data.bookingStatus || "confirmed",
        confirmedAt: data.confirmedAt || /* @__PURE__ */ new Date()
      }).returning();
      return booking;
    });
  }
  async getLiftClubBookingsByUser(userId) {
    const bookings = await db.select().from(liftClubBookings).where((0, import_drizzle_orm2.eq)(liftClubBookings.riderId, userId)).orderBy((0, import_drizzle_orm2.desc)(liftClubBookings.createdAt));
    const routes = await Promise.all(bookings.map((booking) => this.getLiftClubRoute(booking.routeId).catch(() => void 0)));
    return bookings.map((booking, index) => ({
      ...booking,
      route: routes[index] || null
    }));
  }
  mapLiftClubMembership(row) {
    if (!row) return void 0;
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      feeAmount: Number(row.fee_amount ?? 200),
      proofDocumentId: row.proof_document_id,
      rejectionReason: row.rejection_reason,
      submittedAt: row.submitted_at,
      paidAt: row.paid_at,
      reviewedAt: row.reviewed_at,
      reviewerAdminId: row.reviewer_admin_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.user_name || row.user_username || row.user_phone || row.user_role ? {
        id: row.user_id,
        name: row.user_name,
        username: row.user_username,
        phone: row.user_phone,
        role: row.user_role
      } : void 0,
      proofDocument: row.document_id ? {
        id: row.document_id,
        type: row.document_type,
        url: row.document_url,
        status: row.document_status,
        reviewReason: row.document_review_reason,
        uploadedAt: row.document_uploaded_at
      } : null
    };
  }
  liftClubMembershipSelect(whereSql = "", values = []) {
    return pool.query(
      `
        SELECT
          m.*,
          u.name AS user_name,
          u.username AS user_username,
          u.phone AS user_phone,
          u.role AS user_role,
          d.id AS document_id,
          d.type AS document_type,
          d.url AS document_url,
          d.status AS document_status,
          d.review_reason AS document_review_reason,
          d.uploaded_at AS document_uploaded_at
        FROM lift_club_memberships m
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN documents d ON d.id = m.proof_document_id
        ${whereSql}
        ORDER BY m.updated_at DESC, m.created_at DESC
      `,
      values
    ).then((result) => result.rows);
  }
  async getLiftClubMembershipByUser(userId) {
    const rows = await this.liftClubMembershipSelect("WHERE m.user_id = $1", [userId]);
    return this.mapLiftClubMembership(rows[0]);
  }
  async getLiftClubMembership(id) {
    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
    return this.mapLiftClubMembership(rows[0]);
  }
  async deleteLiftClubMembership(id) {
    const deleted = await db.delete(liftClubMemberships).where((0, import_drizzle_orm2.eq)(liftClubMemberships.id, id)).returning({ id: liftClubMemberships.id });
    return deleted.length > 0;
  }
  async getLiftClubMemberships(filters = {}) {
    const rows = filters.status ? await this.liftClubMembershipSelect("WHERE m.status = $1", [filters.status]) : await this.liftClubMembershipSelect();
    return rows.map((row) => this.mapLiftClubMembership(row));
  }
  async upsertLiftClubMembership(data) {
    const result = await pool.query(
      `
        INSERT INTO lift_club_memberships (
          user_id,
          status,
          fee_amount,
          proof_document_id,
          rejection_reason,
          submitted_at,
          paid_at,
          reviewed_at,
          reviewer_admin_id,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $9, now())
        ON CONFLICT (user_id) DO UPDATE SET
          status = EXCLUDED.status,
          fee_amount = EXCLUDED.fee_amount,
          proof_document_id = COALESCE(EXCLUDED.proof_document_id, lift_club_memberships.proof_document_id),
          rejection_reason = EXCLUDED.rejection_reason,
          submitted_at = COALESCE(EXCLUDED.submitted_at, lift_club_memberships.submitted_at, now()),
          paid_at = COALESCE(EXCLUDED.paid_at, lift_club_memberships.paid_at),
          reviewed_at = COALESCE(EXCLUDED.reviewed_at, lift_club_memberships.reviewed_at),
          reviewer_admin_id = COALESCE(EXCLUDED.reviewer_admin_id, lift_club_memberships.reviewer_admin_id),
          updated_at = now()
        RETURNING *
      `,
      [
        data.userId,
        data.status || "pending_payment",
        data.feeAmount ?? 200,
        data.proofDocumentId ?? null,
        data.rejectionReason ?? null,
        data.submittedAt ?? null,
        data.paidAt ?? null,
        data.reviewedAt ?? null,
        data.reviewerAdminId ?? null
      ]
    );
    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [result.rows[0].id]);
    return this.mapLiftClubMembership(rows[0]);
  }
  async updateLiftClubMembership(id, data) {
    const fieldMap = {
      status: "status",
      feeAmount: "fee_amount",
      proofDocumentId: "proof_document_id",
      rejectionReason: "rejection_reason",
      submittedAt: "submitted_at",
      paidAt: "paid_at",
      reviewedAt: "reviewed_at",
      reviewerAdminId: "reviewer_admin_id"
    };
    const entries = Object.entries(fieldMap).filter(([key]) => Object.prototype.hasOwnProperty.call(data, key));
    if (entries.length === 0) {
      const rows2 = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
      return this.mapLiftClubMembership(rows2[0]);
    }
    const values = [id];
    const assignments = entries.map(([key, column], index) => {
      values.push(data[key]);
      return `${column} = $${index + 2}`;
    });
    await pool.query(
      `
        UPDATE lift_club_memberships
        SET ${assignments.join(", ")}, updated_at = now()
        WHERE id = $1
      `,
      values
    );
    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
    return this.mapLiftClubMembership(rows[0]);
  }
  async createDocument(data) {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }
  async getDocumentsByApplication(applicationId) {
    return db.select().from(documents).where((0, import_drizzle_orm2.eq)(documents.applicationId, applicationId)).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async getDocumentsByUser(userId) {
    return db.select().from(documents).where((0, import_drizzle_orm2.eq)(documents.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async getDocumentsByVehicle(vehicleId) {
    return db.select().from(documents).where((0, import_drizzle_orm2.eq)(documents.vehicleId, vehicleId)).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async getAllDocuments() {
    return db.select().from(documents).orderBy((0, import_drizzle_orm2.desc)(documents.uploadedAt));
  }
  async updateDocument(id, data) {
    const [doc] = await db.update(documents).set(data).where((0, import_drizzle_orm2.eq)(documents.id, id)).returning();
    return doc;
  }
  async createRide(data) {
    const [ride] = await db.insert(rides).values(data).returning();
    return ride;
  }
  async getRide(id) {
    const [ride] = await db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.id, id));
    return ride;
  }
  async updateRide(id, data) {
    const [ride] = await db.update(rides).set(data).where((0, import_drizzle_orm2.eq)(rides.id, id)).returning();
    return ride;
  }
  /** Atomically accepts a ride — the UPDATE only fires when the ride is still in an
   *  acceptable state, preventing two drivers from claiming the same trip. */
  async acceptRideAtomic(rideId, chauffeurId, vehicleId) {
    const [ride] = await db.update(rides).set({
      chauffeurId,
      vehicleId: vehicleId || null,
      status: "chauffeur_assigned",
      acceptedAt: /* @__PURE__ */ new Date()
    }).where(
      (0, import_drizzle_orm2.and)(
        (0, import_drizzle_orm2.eq)(rides.id, rideId),
        import_drizzle_orm2.sql`${rides.status} IN ('requested', 'searching')`,
        (0, import_drizzle_orm2.eq)(rides.currentOfferedChauffeurId, chauffeurId),
        import_drizzle_orm2.sql`${rides.currentOfferExpiresAt} > now()`
      )
    ).returning();
    return ride;
  }
  async getRidesByClient(clientId) {
    return db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.clientId, clientId)).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getRidesByChauffeur(chauffeurId) {
    return db.select().from(rides).where((0, import_drizzle_orm2.eq)(rides.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getActiveRides() {
    return db.select().from(rides).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async getAllRides() {
    return db.select().from(rides).orderBy((0, import_drizzle_orm2.desc)(rides.createdAt));
  }
  async createLivenessSession(data) {
    const [session] = await db.insert(livenessSessions).values(data).returning();
    return session;
  }
  async getLivenessSession(id) {
    const [session] = await db.select().from(livenessSessions).where((0, import_drizzle_orm2.eq)(livenessSessions.id, id));
    return session;
  }
  async getLatestPendingLivenessSessionByUser(userId) {
    const [session] = await db.select().from(livenessSessions).where((0, import_drizzle_orm2.and)((0, import_drizzle_orm2.eq)(livenessSessions.userId, userId), (0, import_drizzle_orm2.eq)(livenessSessions.status, "pending"))).orderBy((0, import_drizzle_orm2.desc)(livenessSessions.createdAt));
    return session;
  }
  async updateLivenessSession(id, data) {
    const safe = { ...data };
    for (const key of ["verifiedAt", "expiresAt", "createdAt", "updatedAt"]) {
      if (safe[key] !== null && safe[key] !== void 0 && !(safe[key] instanceof Date)) {
        safe[key] = new Date(safe[key]);
      }
    }
    const [session] = await db.update(livenessSessions).set({ ...safe, updatedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(livenessSessions.id, id)).returning();
    return session;
  }
  async createPayment(data) {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }
  async getAllUsers() {
    return db.select().from(users).orderBy((0, import_drizzle_orm2.desc)(users.createdAt));
  }
  async getAllPayments() {
    return db.select().from(payments).orderBy((0, import_drizzle_orm2.desc)(payments.createdAt));
  }
  async getPaymentsByRide(rideId) {
    return db.select().from(payments).where((0, import_drizzle_orm2.eq)(payments.rideId, rideId)).orderBy((0, import_drizzle_orm2.desc)(payments.createdAt));
  }
  async updatePayment(id, data) {
    const [payment] = await db.update(payments).set(data).where((0, import_drizzle_orm2.eq)(payments.id, id)).returning();
    return payment;
  }
  async createRideRating(data) {
    const [rating] = await db.insert(rideRatings).values(data).returning();
    return rating;
  }
  async getRatingsByChauffeur(chauffeurId) {
    return db.select().from(rideRatings).where((0, import_drizzle_orm2.eq)(rideRatings.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(rideRatings.createdAt));
  }
  async getAverageRatingForUser(userId) {
    const chauffeur = await this.getChauffeurByUserId(userId);
    if (!chauffeur) return null;
    const [row] = await db.select({ value: (0, import_drizzle_orm2.avg)(rideRatings.rating) }).from(rideRatings).where((0, import_drizzle_orm2.eq)(rideRatings.chauffeurId, chauffeur.id));
    const value = row?.value ?? null;
    return value;
  }
  async createEarning(data) {
    const [earning] = await db.insert(earnings).values(data).returning();
    return earning;
  }
  async getEarningsByChauffeur(chauffeurId) {
    return db.select().from(earnings).where((0, import_drizzle_orm2.eq)(earnings.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(earnings.createdAt));
  }
  async getAllEarnings() {
    return db.select().from(earnings).orderBy((0, import_drizzle_orm2.desc)(earnings.createdAt));
  }
  async createWithdrawal(data) {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }
  async getWithdrawal(id) {
    const [withdrawal] = await db.select().from(withdrawals).where((0, import_drizzle_orm2.eq)(withdrawals.id, id));
    return withdrawal;
  }
  async getWithdrawalsByChauffeur(chauffeurId) {
    return db.select().from(withdrawals).where((0, import_drizzle_orm2.eq)(withdrawals.chauffeurId, chauffeurId)).orderBy((0, import_drizzle_orm2.desc)(withdrawals.createdAt));
  }
  async getAllWithdrawals() {
    return db.select().from(withdrawals).orderBy((0, import_drizzle_orm2.desc)(withdrawals.createdAt));
  }
  async updateWithdrawal(id, data) {
    const [withdrawal] = await db.update(withdrawals).set(data).where((0, import_drizzle_orm2.eq)(withdrawals.id, id)).returning();
    return withdrawal;
  }
  async createMessage(data) {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }
  async getMessagesByRide(rideId) {
    return db.select().from(messages).where((0, import_drizzle_orm2.eq)(messages.rideId, rideId)).orderBy(messages.createdAt);
  }
  async createSafetyReport(data) {
    const [report] = await db.insert(safetyReports).values(data).returning();
    return report;
  }
  async getSafetyReportsByUser(userId) {
    return db.select().from(safetyReports).where((0, import_drizzle_orm2.eq)(safetyReports.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(safetyReports.createdAt));
  }
  async getAllSafetyReports() {
    return db.select().from(safetyReports).orderBy((0, import_drizzle_orm2.desc)(safetyReports.createdAt));
  }
  async updateSafetyReport(id, data) {
    const [report] = await db.update(safetyReports).set(data).where((0, import_drizzle_orm2.eq)(safetyReports.id, id)).returning();
    return report;
  }
  async createNotification(data) {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }
  async getNotificationsByUser(userId) {
    return db.select().from(notifications).where((0, import_drizzle_orm2.eq)(notifications.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(notifications.createdAt));
  }
  async markNotificationRead(id) {
    const [notification] = await db.update(notifications).set({ isRead: true }).where((0, import_drizzle_orm2.eq)(notifications.id, id)).returning();
    return notification;
  }
  async deleteAllNotificationsByUser(userId) {
    await db.delete(notifications).where((0, import_drizzle_orm2.eq)(notifications.userId, userId));
  }
  async getSavedCard(id) {
    const [card] = await db.select().from(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.id, id));
    return card;
  }
  async getSavedCardsByUser(userId) {
    return db.select().from(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(savedCards.createdAt));
  }
  async createSavedCard(data) {
    const [card] = await db.insert(savedCards).values(data).returning();
    return card;
  }
  async updateSavedCard(id, data) {
    const [card] = await db.update(savedCards).set(data).where((0, import_drizzle_orm2.eq)(savedCards.id, id)).returning();
    return card;
  }
  async deleteSavedCard(id) {
    await db.delete(savedCards).where((0, import_drizzle_orm2.eq)(savedCards.id, id));
  }
  async createWalletTransaction(data) {
    const [tx] = await db.insert(walletTransactions).values(data).returning();
    return tx;
  }
  async getWalletTransactions(userId) {
    return db.select().from(walletTransactions).where((0, import_drizzle_orm2.eq)(walletTransactions.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(walletTransactions.createdAt)).limit(50);
  }
  async createReferralEvent(data) {
    const [event] = await db.insert(referralEvents).values(data).returning();
    return event;
  }
  async getReferralEventByReferredUserId(userId) {
    const [event] = await db.select().from(referralEvents).where((0, import_drizzle_orm2.eq)(referralEvents.referredUserId, userId));
    return event;
  }
  async getReferralEventsByReferrerUserId(userId) {
    return db.select().from(referralEvents).where((0, import_drizzle_orm2.eq)(referralEvents.referrerUserId, userId)).orderBy((0, import_drizzle_orm2.desc)(referralEvents.createdAt));
  }
  async updateReferralEvent(id, data) {
    const [event] = await db.update(referralEvents).set(data).where((0, import_drizzle_orm2.eq)(referralEvents.id, id)).returning();
    return event;
  }
  async createRewardTransaction(data) {
    const [tx] = await db.insert(rewardTransactions).values(data).returning();
    return tx;
  }
  async getRewardTransactions(userId) {
    return db.select().from(rewardTransactions).where((0, import_drizzle_orm2.eq)(rewardTransactions.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(rewardTransactions.createdAt)).limit(100);
  }
  async getRewardTransactionByRideAndType(userId, rideId, type, sourceUserId) {
    const conditions = [
      (0, import_drizzle_orm2.eq)(rewardTransactions.userId, userId),
      (0, import_drizzle_orm2.eq)(rewardTransactions.rideId, rideId),
      (0, import_drizzle_orm2.eq)(rewardTransactions.type, type)
    ];
    if (sourceUserId) {
      conditions.push((0, import_drizzle_orm2.eq)(rewardTransactions.sourceUserId, sourceUserId));
    }
    const [tx] = await db.select().from(rewardTransactions).where((0, import_drizzle_orm2.and)(...conditions));
    return tx;
  }
  async getRewardTransactionByReference(reference) {
    const [tx] = await db.select().from(rewardTransactions).where((0, import_drizzle_orm2.eq)(rewardTransactions.reference, reference));
    return tx;
  }
  async createRewardCashout(data) {
    const [cashout] = await db.insert(rewardCashouts).values(data).returning();
    return cashout;
  }
  async getRewardCashout(id) {
    const [cashout] = await db.select().from(rewardCashouts).where((0, import_drizzle_orm2.eq)(rewardCashouts.id, id));
    return cashout;
  }
  async getRewardCashoutsByUser(userId) {
    return db.select().from(rewardCashouts).where((0, import_drizzle_orm2.eq)(rewardCashouts.userId, userId)).orderBy((0, import_drizzle_orm2.desc)(rewardCashouts.requestedAt));
  }
  async getAllRewardCashouts() {
    return db.select().from(rewardCashouts).orderBy((0, import_drizzle_orm2.desc)(rewardCashouts.requestedAt));
  }
  async updateRewardCashout(id, data) {
    const [cashout] = await db.update(rewardCashouts).set(data).where((0, import_drizzle_orm2.eq)(rewardCashouts.id, id)).returning();
    return cashout;
  }
  async updateWithdrawalByTransferCode(transferCode, data) {
    const [w] = await db.update(withdrawals).set(data).where((0, import_drizzle_orm2.eq)(withdrawals.paystackTransferCode, transferCode)).returning();
    return w;
  }
  async createTripEnquiry(data) {
    const [enquiry] = await db.insert(tripEnquiries).values(data).returning();
    return enquiry;
  }
  async getAllTripEnquiries() {
    return db.select().from(tripEnquiries).orderBy((0, import_drizzle_orm2.desc)(tripEnquiries.createdAt));
  }
  async replyToTripEnquiry(id, adminReply) {
    const [enquiry] = await db.update(tripEnquiries).set({ adminReply, status: "replied", repliedAt: /* @__PURE__ */ new Date() }).where((0, import_drizzle_orm2.eq)(tripEnquiries.id, id)).returning();
    return enquiry;
  }
  // ── Admin hard-delete helpers ────────────────────────────────────────────────
  async deleteRide(id) {
    const deleted = await db.delete(rides).where((0, import_drizzle_orm2.eq)(rides.id, id)).returning();
    return deleted.length > 0;
  }
  async deleteUser(id) {
    const deleted = await db.delete(users).where((0, import_drizzle_orm2.eq)(users.id, id)).returning();
    return deleted.length > 0;
  }
  // Hard-delete a user together with every row that references them, in FK
  // dependency order, inside a single transaction. This is what the admin
  // "delete user" action uses so a driver/partner account (which owns an
  // operator_profile + vehicles) can be removed without hitting foreign-key
  // constraint violations. Either the whole delete succeeds or nothing changes.
  async deleteUserCascade(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const profRes = await client.query(
        "SELECT id FROM operator_profiles WHERE user_id = $1",
        [id]
      );
      const profileIds = profRes.rows.map((r) => r.id);
      let vehicleIds = [];
      if (profileIds.length) {
        const vehRes = await client.query(
          "SELECT id FROM vehicles WHERE owner_operator_profile_id = ANY($1)",
          [profileIds]
        );
        vehicleIds = vehRes.rows.map((r) => r.id);
      }
      if (vehicleIds.length) {
        await client.query("UPDATE lift_club_routes SET vehicle_id = NULL WHERE vehicle_id = ANY($1)", [vehicleIds]);
        await client.query("DELETE FROM vehicle_assignments WHERE vehicle_id = ANY($1)", [vehicleIds]);
        await client.query("DELETE FROM documents WHERE vehicle_id = ANY($1)", [vehicleIds]);
      }
      if (profileIds.length) {
        await client.query("DELETE FROM vehicle_assignments WHERE driver_operator_profile_id = ANY($1) OR assigned_by_operator_profile_id = ANY($1)", [profileIds]);
        await client.query("DELETE FROM fleet_driver_invites WHERE driver_operator_profile_id = ANY($1) OR invited_by_operator_profile_id = ANY($1)", [profileIds]);
        await client.query("DELETE FROM partner_profiles WHERE operator_profile_id = ANY($1)", [profileIds]);
        await client.query("DELETE FROM vehicles WHERE owner_operator_profile_id = ANY($1)", [profileIds]);
        await client.query("DELETE FROM operator_profiles WHERE user_id = $1", [id]);
      }
      await client.query("DELETE FROM fleet_driver_invites WHERE invited_by_user_id = $1", [id]);
      await client.query("DELETE FROM referral_events WHERE referred_user_id = $1 OR referrer_user_id = $1", [id]);
      await client.query("DELETE FROM reward_transactions WHERE user_id = $1 OR source_user_id = $1", [id]);
      await client.query("DELETE FROM reward_cashouts WHERE user_id = $1", [id]);
      await client.query("DELETE FROM lift_club_bookings WHERE rider_id = $1", [id]);
      await client.query("DELETE FROM lift_club_memberships WHERE user_id = $1", [id]);
      await client.query("DELETE FROM liveness_sessions WHERE user_id = $1", [id]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
      await client.query("DELETE FROM push_delivery_logs WHERE user_id = $1", [id]);
      await client.query("DELETE FROM client_ratings WHERE client_id = $1", [id]);
      await client.query("DELETE FROM documents WHERE user_id = $1", [id]);
      await client.query("UPDATE users SET referred_by_user_id = NULL WHERE referred_by_user_id = $1", [id]);
      await client.query("UPDATE lift_club_memberships SET reviewer_admin_id = NULL WHERE reviewer_admin_id = $1", [id]);
      await client.query("UPDATE reward_cashouts SET reviewed_by_admin_id = NULL WHERE reviewed_by_admin_id = $1", [id]);
      await client.query("UPDATE operator_profiles SET reviewer_admin_id = NULL WHERE reviewer_admin_id = $1", [id]);
      await client.query("UPDATE vehicles SET reviewer_admin_id = NULL WHERE reviewer_admin_id = $1", [id]);
      await client.query("DELETE FROM admin_audit_logs WHERE admin_user_id = $1", [id]);
      const del = await client.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
      await client.query("COMMIT");
      return (del.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async deleteWithdrawal(id) {
    const deleted = await db.delete(withdrawals).where((0, import_drizzle_orm2.eq)(withdrawals.id, id)).returning();
    return deleted.length > 0;
  }
  async deleteSafetyReport(id) {
    const deleted = await db.delete(safetyReports).where((0, import_drizzle_orm2.eq)(safetyReports.id, id)).returning();
    return deleted.length > 0;
  }
  async deletePayment(id) {
    const deleted = await db.delete(payments).where((0, import_drizzle_orm2.eq)(payments.id, id)).returning();
    return deleted.length > 0;
  }
  async deleteDocument(id) {
    const deleted = await db.delete(documents).where((0, import_drizzle_orm2.eq)(documents.id, id)).returning();
    return deleted.length > 0;
  }
};
var storage = new DatabaseStorage();

// server/db.ts
var import_node_postgres2 = require("drizzle-orm/node-postgres");
var import_pg2 = require("pg");
var dbUrl2 = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl2) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL must be set.");
}
var isSupabase = dbUrl2.includes("supabase");
var maskedUrl = dbUrl2.replace(/:([^:@]+)@/, ":***@");
console.log(`[DB] Connecting to: ${isSupabase ? "SUPABASE \u2705" : "LOCAL/OTHER \u274C"}`);
console.log(`[DB] Full URL: ${maskedUrl}`);
var requireSsl2 = dbUrl2.includes("supabase") || dbUrl2.includes("neon.tech");
var pool2 = new import_pg2.Pool({
  connectionString: dbUrl2,
  ssl: requireSsl2 ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 1e4,
  connectionTimeoutMillis: 5e3
});
var db2 = (0, import_node_postgres2.drizzle)(pool2, { schema: schema_exports });

// server/routes.ts
var import_drizzle_orm4 = require("drizzle-orm");

// server/livenessPhotoService.ts
var import_drizzle_orm3 = require("drizzle-orm");
var SUPABASE_URL = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
async function uploadLivenessPhoto(params) {
  const {
    sessionId,
    userId,
    rideId,
    photoBase64,
    mimeType = "image/jpeg",
    photoType
  } = params;
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const bucket = photoType === "cash_selfie" ? "ride-photos" : "liveness-photos";
  const ext = mimeType.split("/")[1];
  const timestamp2 = Date.now();
  const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const storagePath = photoType === "cash_selfie" ? `rides/${rideId ?? safeSession}/${safeUser}_cash_selfie_${timestamp2}.${ext}` : `sessions/${safeSession}/${safeUser}_liveness_${timestamp2}.${ext}`;
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
        "Content-Type": mimeType,
        "x-upsert": "false"
      },
      body: buffer
    }
  );
  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => uploadRes.statusText);
    console.error("[livenessPhotoService] upload error:", uploadRes.status, errText);
    return { success: false, error: errText };
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;
  try {
    if (photoType === "liveness") {
      await db2.update(livenessSessions).set({
        verifiedPhotoUrl: storagePath,
        rideId: rideId ?? null,
        updatedAt: /* @__PURE__ */ new Date()
      }).where((0, import_drizzle_orm3.eq)(livenessSessions.id, sessionId));
    } else {
      await db2.update(rides).set({ cashSelfieUrl: storagePath }).where((0, import_drizzle_orm3.eq)(rides.id, rideId ?? sessionId));
    }
  } catch (dbErr) {
    console.warn("[livenessPhotoService] DB update error:", dbErr.message);
  }
  return { success: true, storagePath, publicUrl };
}
async function getAdminSignedUrl(bucket, storagePath, expiresInSeconds = 3600) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${storagePath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds })
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
  } catch {
    return null;
  }
}

// server/luxuryPricingEngine.ts
var VEHICLE_CATEGORIES = {
  budget: { name: "Budget", pricePerKm: 7, baseFare: 50, examples: "Toyota Corolla, Toyota Quest" },
  luxury: { name: "Luxury", pricePerKm: 13, baseFare: 100, examples: "BMW 3 Series, Mercedes C Class" },
  business: { name: "Business Class", pricePerKm: 35, baseFare: 150, examples: "BMW 5 Series, Mercedes E Class" },
  van: { name: "Van", pricePerKm: 13, baseFare: 120, examples: "Hyundai H1, Mercedes Vito, Staria" },
  luxury_van: { name: "Luxury Van", pricePerKm: 35, baseFare: 200, examples: "Mercedes V Class" }
};
var PRICING_CONFIG = {
  lateNightPremiumMultiplier: 1.3,
  commissionRate: 0.25,
  platformFeeRate: 0.2,
  driverAnnualShareRate: 0.05,
  maxSurgeMultiplier: 5,
  perMinuteAdjustmentRate: 1,
  cancellationGracePeriodMin: 3
};
function calculateSurgeMultiplier(input) {
  const activeRequests = Math.max(0, Math.floor(Number(input.activeRequests) || 0));
  const eligibleDrivers = Math.max(0, Math.floor(Number(input.eligibleDrivers) || 0));
  if (activeRequests <= 0 || activeRequests <= eligibleDrivers) {
    return { multiplier: 1, reason: null, highDemand: false };
  }
  const driverCount = Math.max(eligibleDrivers, 1);
  const rawMultiplier = activeRequests / driverCount;
  const multiplier = Math.min(
    PRICING_CONFIG.maxSurgeMultiplier,
    Math.max(1, Math.ceil(rawMultiplier * 10) / 10)
  );
  return {
    multiplier,
    reason: "High demand: more ride requests than nearby matching cars",
    highDemand: multiplier > 1
  };
}
function calculatePrice(distanceKm, categoryId, options) {
  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  const baseFare = category.baseFare;
  const distanceFare = distanceKm * category.pricePerKm;
  let subtotal = baseFare + distanceFare;
  let lateNightPremium = 0;
  if (options?.isLateNight) {
    lateNightPremium = subtotal * (PRICING_CONFIG.lateNightPremiumMultiplier - 1);
    subtotal += lateNightPremium;
  }
  const requestedSurge = Number(options?.surgeMultiplier ?? options?.demandMultiplier ?? 1);
  const surgeMultiplier = Math.min(
    PRICING_CONFIG.maxSurgeMultiplier,
    Math.max(1, Number.isFinite(requestedSurge) ? requestedSurge : 1)
  );
  const surgeAmount = subtotal * (surgeMultiplier - 1);
  subtotal += surgeAmount;
  return {
    baseFare: Math.round(baseFare),
    distanceFare: Math.round(distanceFare),
    totalPrice: Math.round(subtotal),
    pricePerKm: category.pricePerKm,
    distanceKm: Math.round(distanceKm * 10) / 10,
    category: category.name,
    currency: "ZAR",
    lateNightPremium: Math.round(lateNightPremium),
    surgeMultiplier,
    demandMultiplier: surgeMultiplier,
    surgeAmount: Math.round(surgeAmount),
    surgeReason: surgeMultiplier > 1 ? options?.surgeReason || "High demand" : null,
    highDemand: surgeMultiplier > 1,
    estimatedDurationMin: typeof options?.estimatedDurationMin === "number" ? Math.max(0, Math.round(options.estimatedDurationMin * 10) / 10) : null,
    perMinuteRate: PRICING_CONFIG.perMinuteAdjustmentRate
  };
}
function calculatePerMinuteAdjustment(estimatedDurationMin, actualDurationMin, ratePerMinute = PRICING_CONFIG.perMinuteAdjustmentRate) {
  const estimated = Number(estimatedDurationMin);
  const actual = Number(actualDurationMin);
  const extraMinutes = Number.isFinite(estimated) && Number.isFinite(actual) ? Math.max(0, Math.ceil(actual - estimated)) : 0;
  return {
    extraMinutes,
    adjustmentAmount: Math.round(extraMinutes * Math.max(0, ratePerMinute)),
    ratePerMinute: Math.max(0, ratePerMinute)
  };
}
function calculateCancellationFee(categoryId, acceptedAt, cancelledAt = /* @__PURE__ */ new Date(), cancelledBy = "client") {
  if (cancelledBy !== "client" || !acceptedAt) {
    return { fee: 0, eligible: false, elapsedMinutes: 0 };
  }
  const accepted = new Date(acceptedAt).getTime();
  const cancelled = new Date(cancelledAt).getTime();
  const elapsedMinutes = Number.isFinite(accepted) && Number.isFinite(cancelled) ? Math.max(0, (cancelled - accepted) / 6e4) : 0;
  if (elapsedMinutes < PRICING_CONFIG.cancellationGracePeriodMin) {
    return { fee: 0, eligible: false, elapsedMinutes };
  }
  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  return { fee: Math.round(category.baseFare), eligible: true, elapsedMinutes };
}
function calculateChauffeurEarnings(totalPrice) {
  const commission = totalPrice * PRICING_CONFIG.commissionRate;
  const platformFee = totalPrice * PRICING_CONFIG.platformFeeRate;
  const driverAnnualShare = totalPrice * PRICING_CONFIG.driverAnnualShareRate;
  const chauffeurEarnings = totalPrice - commission;
  return {
    totalPrice,
    commission: Math.round(commission),
    platformFee: Math.round(platformFee),
    driverAnnualShare: Math.round(driverAnnualShare),
    chauffeurEarnings: Math.round(chauffeurEarnings)
  };
}
function getVehicleCategories() {
  return VEHICLE_CATEGORIES;
}
function getPricingConfig() {
  return { ...PRICING_CONFIG, categories: VEHICLE_CATEGORIES };
}

// server/rideOperations.ts
var RIDE_OFFER_WINDOW_MS = 45e3;
var CATEGORY_ALIASES = {
  budget: "budget",
  economy: "budget",
  standard: "budget",
  sedan: "budget",
  luxury: "luxury",
  business: "business",
  business_class: "business",
  van: "van",
  luxury_van: "luxury_van",
  vclass: "luxury_van",
  v_class: "luxury_van",
  "v-class": "luxury_van"
};
var MULTI_CATEGORY_MATCHES = {
  executive: ["business", "luxury", "luxury_van"],
  luxury_van: ["van"]
};
function normalizeVehicleType(vehicleType) {
  const normalized = String(vehicleType || "budget").trim().toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_ALIASES[normalized] || normalized || "budget";
}
function isVehicleEligibleForRide(requestedVehicleType, activeVehicleType) {
  const requested = normalizeVehicleType(requestedVehicleType);
  const active = normalizeVehicleType(activeVehicleType);
  if (requested === active) return true;
  return (MULTI_CATEGORY_MATCHES[active] || []).includes(requested);
}
function getRideOfferExpiresAt(now = /* @__PURE__ */ new Date()) {
  return new Date(now.getTime() + RIDE_OFFER_WINDOW_MS);
}
function isRideOfferActive(ride, chauffeurId, now = /* @__PURE__ */ new Date()) {
  if (!ride.currentOfferedChauffeurId || ride.currentOfferedChauffeurId !== chauffeurId) {
    return false;
  }
  if (!ride.currentOfferExpiresAt) {
    return false;
  }
  return new Date(ride.currentOfferExpiresAt).getTime() > now.getTime();
}

// server/release-info.ts
function getReleaseFingerprint(environment = process.env) {
  return environment.RAILWAY_GIT_COMMIT_SHA || environment.GIT_COMMIT_SHA || "local";
}

// server/auth.ts
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var JWT_ISSUER = "a2b-lift";
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}
function signAccessToken(claims) {
  return import_jsonwebtoken.default.sign(claims, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: JWT_ISSUER
  });
}
function verifyAccessToken(token) {
  const decoded = import_jsonwebtoken.default.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER
  });
  return decoded;
}

// server/auth-middleware.ts
function extractBearer(req) {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return null;
  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
function authOptional(req, _res, next) {
  try {
    const token = extractBearer(req) || req.cookies?.a2b_token || null;
    if (token) {
      req.auth = verifyAccessToken(token);
    }
  } catch {
  }
  next();
}
function requireAuth(req, res, next) {
  const token = extractBearer(req) || req.cookies?.a2b_token || null;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.auth = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}
function requireRole(roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

// server/external-api-service.ts
var ExternalApiService = class {
  config;
  constructor() {
    const baseUrl = process.env.EXTERNAL_API_URL || "http://103.154.2.122";
    const apiKey = process.env.EXTERNAL_API_KEY;
    this.config = {
      baseUrl: baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl,
      timeout: parseInt(process.env.EXTERNAL_API_TIMEOUT || "30000", 10),
      apiKey
    };
  }
  /**
   * Generic method to make requests to the external API
   */
  async request(endpoint, options = {}) {
    try {
      const url = `${this.config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
      const headers = {
        "Content-Type": "application/json",
        ...options.headers
      };
      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        headers["X-API-Key"] = this.config.apiKey;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      const response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`,
          statusCode: response.status
        };
      }
      return {
        success: true,
        data,
        statusCode: response.status
      };
    } catch (error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          error: "Request timeout"
        };
      }
      return {
        success: false,
        error: error.message || "Unknown error"
      };
    }
  }
  /**
   * Health check - test connection to external API
   */
  async healthCheck() {
    return this.request("/health", { method: "GET" });
  }
  /**
   * Get API status/info
   */
  async getStatus() {
    return this.request("/status", { method: "GET" });
  }
  /**
   * Generic GET request
   */
  async get(endpoint, headers) {
    return this.request(endpoint, { method: "GET", headers });
  }
  /**
   * Generic POST request
   */
  async post(endpoint, body, headers) {
    return this.request(endpoint, { method: "POST", body, headers });
  }
  /**
   * Generic PUT request
   */
  async put(endpoint, body, headers) {
    return this.request(endpoint, { method: "PUT", body, headers });
  }
  /**
   * Generic DELETE request
   */
  async delete(endpoint, headers) {
    return this.request(endpoint, { method: "DELETE", headers });
  }
};
var externalApiService = new ExternalApiService();

// server/routes.ts
var RIDE_MATCH_RADIUS_KM = 25;
var CHAUFFEUR_LOCATION_STALE_WINDOW_MS = 10 * 60 * 1e3;
var TOTAL_COMMISSION_RATE = 0.25;
var DRIVER_ANNUAL_SHARE_RATE = 0.05;
var REFERRAL_REWARD_RATE = 0.025;
var DRIVER_SHARE_MIN_ACTIVE_MONTHS = 3;
var DRIVER_SHARE_MIN_WEEKLY_TRIPS = 5;
function calculateHaversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function getAnnualShareGrossFromEarning(earning) {
  const amount = Math.abs(Number(earning?.amount || 0));
  const commission = Math.abs(Number(earning?.commission || 0));
  if (commission > 0) return commission / TOTAL_COMMISSION_RATE;
  return amount > 0 ? amount / (1 - TOTAL_COMMISSION_RATE) : 0;
}
function summarizeAnnualDriverShare(earnings2, year = (/* @__PURE__ */ new Date()).getFullYear()) {
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  const qualifying = earnings2.filter((earning) => {
    const createdAt = new Date(earning.createdAt || Date.now()).getTime();
    const type = String(earning.type || "");
    return createdAt >= start && createdAt < end && !type.includes("lift_club") && (type === "cash" || type === "card" || type === "wallet" || type.startsWith("long_distance"));
  });
  const gross = qualifying.reduce((sum, earning) => sum + getAnnualShareGrossFromEarning(earning), 0);
  return {
    year,
    qualifyingTrips: qualifying.length,
    grossQualifyingFare: Math.round(gross * 100) / 100,
    annualShare: Math.round(gross * DRIVER_ANNUAL_SHARE_RATE * 100) / 100,
    platformFee: Math.round(gross * 0.2 * 100) / 100,
    totalCommission: Math.round(gross * TOTAL_COMMISSION_RATE * 100) / 100,
    rules: {
      minimumActiveMonths: DRIVER_SHARE_MIN_ACTIVE_MONTHS,
      minimumWeeklyTrips: DRIVER_SHARE_MIN_WEEKLY_TRIPS,
      excludes: "Daily Lift Club trips and bookings",
      payoutMonth: "December"
    }
  };
}
async function creditReferralReward(options) {
  const sourceUserId = options.sourceUserId || options.referredUserId || options.riderUserId;
  const sourceUser = sourceUserId ? await storage.getUser(sourceUserId) : void 0;
  const referrerUserId = sourceUser?.referredByUserId;
  if (!referrerUserId) return;
  const reward = Math.round(options.grossFare * REFERRAL_REWARD_RATE * 100) / 100;
  if (reward <= 0) return;
  if (options.rideId) {
    const alreadyPaid = await storage.getRewardTransactionByRideAndType(
      referrerUserId,
      options.rideId,
      options.type,
      sourceUserId || void 0
    );
    if (alreadyPaid) return;
  }
  const referrer = await storage.getUser(referrerUserId);
  if (!referrer) return;
  const balanceBefore = referrer.rewardsBalance || 0;
  const balanceAfter = balanceBefore + reward;
  await storage.updateUser(referrer.id, { rewardsBalance: balanceAfter });
  await storage.createRewardTransaction({
    userId: referrer.id,
    sourceUserId,
    rideId: options.rideId || null,
    type: options.type,
    amount: reward,
    balanceBefore,
    balanceAfter,
    description: options.description,
    status: "completed",
    reference: `${options.referencePrefix}_${options.rideId || Date.now()}_${referrer.id.slice(0, 6)}`
  });
  if (sourceUserId) {
    const refEvent = await storage.getReferralEventByReferredUserId(sourceUserId);
    if (refEvent) {
      await storage.updateReferralEvent(refEvent.id, {
        totalRewards: (refEvent.totalRewards || 0) + reward,
        lastRewardAt: /* @__PURE__ */ new Date(),
        status: "active"
      });
    }
  }
  await storage.createNotification({
    userId: referrer.id,
    title: "Reward Earnings",
    body: options.notificationBody.replace("{amount}", reward.toFixed(2)),
    type: "reward"
  });
}
function hasFreshChauffeurLocation(chauffeur) {
  if (chauffeur.lat == null || chauffeur.lng == null) return false;
  if (!chauffeur.locationUpdatedAt) return true;
  const timestamp2 = new Date(chauffeur.locationUpdatedAt).getTime();
  if (!Number.isFinite(timestamp2)) return true;
  return Date.now() - timestamp2 <= CHAUFFEUR_LOCATION_STALE_WINDOW_MS;
}
async function sendExpoPushNotification(tokens, title, body, data, options) {
  const urgent = options?.urgent ?? false;
  const channelId = options?.channelId || (urgent ? "ride-alerts-v3" : "default");
  const sound = urgent ? "trip_alert.wav" : "default";
  const messages2 = tokens.filter((t) => t && (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))).map((to) => ({
    to,
    sound,
    title,
    body,
    data: data || {},
    badge: urgent ? 1 : void 0,
    priority: urgent ? "high" : "normal",
    ttl: urgent ? 300 : 3600,
    channelId,
    // iOS: mark as time-sensitive so it breaks through Focus modes
    interruptionLevel: urgent ? "time-sensitive" : "active",
    // Android: explicit channel + max priority on the notification object
    android: {
      channelId,
      sound,
      priority: urgent ? "max" : "high",
      sticky: false,
      vibrate: urgent ? [0, 250, 250, 250] : void 0
    }
  }));
  if (messages2.length === 0) return;
  try {
    const res = await import_axios.default.post("https://exp.host/--/api/v2/push/send", messages2, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate"
      },
      timeout: 8e3
    });
    const results = Array.isArray(res.data?.data) ? res.data.data : [];
    results.forEach((r, i) => {
      if (r?.status === "error") {
        console.error(`[push] Token ${tokens[i]} error: ${r.message} (${r.details?.error})`);
      }
    });
  } catch (e) {
    console.error("[push] Failed to send Expo push notification:", e.message);
  }
}
async function notifyUserEvent(options) {
  await storage.createNotification({
    userId: options.userId,
    type: options.type,
    title: options.title,
    body: options.body,
    isRead: false
  });
  const [user, chauffeur] = await Promise.all([
    storage.getUser(options.userId).catch(() => void 0),
    storage.getChauffeurByUserId(options.userId).catch(() => void 0)
  ]);
  const pushToken = user?.pushToken || chauffeur?.pushToken;
  if (pushToken) {
    await sendExpoPushNotification([pushToken], options.title, options.body, options.data);
  }
}
function generateAIResponse(type, description) {
  const responses = {
    safety: [
      "We take your safety seriously. Your report has been logged and our safety team has been notified immediately. If you are in immediate danger, please call emergency services (10111). We will follow up within 24 hours.",
      "Thank you for reporting this safety concern. A safety specialist has been assigned to review your case. Please stay in a safe location. Emergency contacts have been alerted."
    ],
    complaint: [
      "We apologize for the inconvenience. Your complaint has been recorded and will be reviewed by our quality assurance team within 24 hours. We strive to maintain the highest standards of service.",
      "Your feedback is important to us. This complaint has been escalated to our management team for immediate review. You may be eligible for a ride credit pending investigation."
    ],
    emergency: [
      "EMERGENCY ALERT: Your report has been flagged as urgent. Our emergency response team has been notified. If you are in immediate danger, please call 10111 (police) or 10177 (ambulance). Your GPS location has been logged.",
      "This emergency has been escalated to the highest priority. Safety team and local authorities will be contacted. Please remain calm and stay connected. Your location is being tracked for your safety."
    ]
  };
  const options = responses[type] || responses.complaint;
  void description;
  return options[Math.floor(Math.random() * options.length)];
}
function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("a2b_token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1e3
  });
}
function getPaystackConfig() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  const currency = process.env.PAYSTACK_CURRENCY || "ZAR";
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL;
  return { secret, currency, callbackUrl };
}
function encodeGoogleAuthState(data) {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}
function decodeGoogleAuthState(rawState) {
  if (!rawState) return {};
  try {
    const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function isAllowedGoogleWebRedirect(rawUrl) {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    const exactAllowed = /* @__PURE__ */ new Set([
      "https://a2blift.com",
      "https://www.a2blift.com",
      "https://peaceful-mousse-459c85.netlify.app",
      "https://api-production-0783.up.railway.app"
    ]);
    if (exactAllowed.has(parsed.origin)) return true;
    if (parsed.hostname.endsWith(".netlify.app")) return true;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
    return false;
  } catch {
    return false;
  }
}
function buildGoogleWebRedirect(rawUrl, params) {
  const redirectUrl = new URL(rawUrl);
  const hashParams = new URLSearchParams(params);
  redirectUrl.hash = hashParams.toString();
  return redirectUrl.toString();
}
function getAppBaseUrl(req) {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (process.env.PAYSTACK_CALLBACK_URL) {
    try {
      const u = new URL(process.env.PAYSTACK_CALLBACK_URL);
      return u.origin;
    } catch {
      return process.env.PAYSTACK_CALLBACK_URL;
    }
  }
  if (req) {
    const proto = req.header("x-forwarded-proto") || req.protocol || "https";
    const host = req.header("x-forwarded-host") || req.get("host") || "";
    return `${proto}://${host}`;
  }
  return "https://api-production-0783.up.railway.app";
}
function getLivenessProvider() {
  const raw = (process.env.LIVENESS_PROVIDER || "mock").toLowerCase().trim();
  return raw === "smile_id" ? "smile_id" : "mock";
}
function buildChallengeCode() {
  const pool3 = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "SMILE"];
  const first = pool3[Math.floor(Math.random() * pool3.length)];
  const second = pool3[Math.floor(Math.random() * pool3.length)];
  return `${first}-${second}`;
}
function challengeLabel(code) {
  const labels = {
    BLINK: "Blink your eyes",
    TURN_LEFT: "Turn your face left",
    TURN_RIGHT: "Turn your face right",
    SMILE: "Give a clear smile"
  };
  return code.split("-").map((part) => labels[part] || part).join(" then ");
}
function isAllowedSelfieUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!["https:"].includes(parsed.protocol)) return false;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (supabaseUrl) {
      const supabaseHost = new URL(supabaseUrl).host;
      if (parsed.host === supabaseHost) return true;
    }
    return parsed.host.endsWith("supabase.co");
  } catch {
    return false;
  }
}
async function runMockSelfieQualityCheck(selfieUrl, faceData, challenge) {
  if (!isAllowedSelfieUrl(selfieUrl)) {
    return { passed: false, score: 0.05, reason: "Selfie URL is not from a trusted storage domain." };
  }
  return { passed: true, score: 0.95 };
}
async function registerRoutes(app2) {
  const httpServer = (0, import_node_http.createServer)(app2);
  try {
    await pool2.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo text");
    await pool2.query("ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS vehicle_year integer");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS dispatch_started_at timestamp");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS current_offered_chauffeur_id varchar REFERENCES chauffeurs(id) ON DELETE SET NULL");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS current_offer_expires_at timestamp");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS accepted_at timestamp");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS trip_started_at timestamp");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancelled_by text");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS cancellation_fee real DEFAULT 0");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS surge_multiplier real DEFAULT 1");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS surge_reason text");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS estimated_duration_min real");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS actual_duration_min real");
    await pool2.query("ALTER TABLE rides ADD COLUMN IF NOT EXISTS per_minute_adjustment real DEFAULT 0");
    await pool2.query("CREATE INDEX IF NOT EXISTS idx_rides_current_offer ON rides(current_offered_chauffeur_id, current_offer_expires_at)");
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS lift_club_memberships (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'pending_payment',
        fee_amount real NOT NULL DEFAULT 200,
        proof_document_id varchar REFERENCES documents(id) ON DELETE SET NULL,
        rejection_reason text,
        submitted_at timestamp DEFAULT now(),
        paid_at timestamp,
        reviewed_at timestamp,
        reviewer_admin_id varchar REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS fee_amount real NOT NULL DEFAULT 200");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS proof_document_id varchar REFERENCES documents(id) ON DELETE SET NULL");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS rejection_reason text");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS submitted_at timestamp DEFAULT now()");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS paid_at timestamp");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS reviewed_at timestamp");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS reviewer_admin_id varchar REFERENCES users(id) ON DELETE SET NULL");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now()");
    await pool2.query("ALTER TABLE lift_club_memberships ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now()");
    await pool2.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_lift_club_memberships_user_id ON lift_club_memberships(user_id)");
    await pool2.query("CREATE INDEX IF NOT EXISTS idx_lift_club_memberships_status ON lift_club_memberships(status)");
    await pool2.query("ALTER TABLE lift_club_memberships ALTER COLUMN fee_amount SET DEFAULT 200");
    await pool2.query("UPDATE lift_club_memberships SET fee_amount = 200, updated_at = now() WHERE status <> 'approved' AND fee_amount = 100");
  } catch (error) {
    console.warn("[routes] startup schema checks skipped:", error instanceof Error ? error.message : error);
  }
  const SUPABASE_SERVICE_KEY_CONFIGURED = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  app2.use("/api", authOptional);
  const io = new import_socket.Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);
    socket.on("chauffeur:register", (data) => {
      if (data?.chauffeurId) {
        socket.data.chauffeurId = data.chauffeurId;
      }
    });
    socket.on("chauffeur:location", async (data) => {
      const { chauffeurId, lat, lng } = data;
      if (chauffeurId) {
        socket.data.chauffeurId = chauffeurId;
        await storage.updateChauffeur(chauffeurId, {
          lat,
          lng,
          locationUpdatedAt: /* @__PURE__ */ new Date()
        });
        io.emit("location:update", { chauffeurId, lat, lng });
      }
    });
    socket.on("ride:request", async () => {
      console.warn("[socket] ignored ride:request event; use POST /api/rides");
    });
    socket.on("chat:message", async (data) => {
      io.emit("chat:newMessage", data);
    });
    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
  const skippedChauffeursByRide = /* @__PURE__ */ new Map();
  const dispatchTimers = /* @__PURE__ */ new Map();
  async function getDriverPushTokens(drivers) {
    const tokens = /* @__PURE__ */ new Set();
    await Promise.all(drivers.map(async (driver) => {
      if (driver?.pushToken) tokens.add(driver.pushToken);
      if (!driver?.userId) return;
      try {
        const driverUser = await storage.getUser(driver.userId);
        if (driverUser?.pushToken) tokens.add(driverUser.pushToken);
      } catch {
      }
    }));
    return Array.from(tokens);
  }
  async function getApprovedActiveVehicle(chauffeur) {
    if (!chauffeur?.userId) return null;
    let activeVehicleId = chauffeur.activeVehicleId || null;
    if (!activeVehicleId) {
      const profile = await storage.getOperatorProfileByUserId(chauffeur.userId).catch(() => void 0);
      if (profile?.id) {
        const assignments = await storage.getVehicleAssignments({ driverOperatorProfileId: profile.id, status: "active" }).catch(() => []);
        for (const assignment of assignments) {
          const assignedVehicle = await storage.getVehicle(assignment.vehicleId).catch(() => void 0);
          if (assignedVehicle && assignedVehicle.status === "approved" && Number(assignedVehicle.vehicleYear || 0) >= 2015) {
            await storage.updateChauffeur(chauffeur.id, { activeVehicleId: assignedVehicle.id }).catch(() => void 0);
            return assignedVehicle;
          }
        }
      }
      return null;
    }
    const vehicle = await storage.getVehicle(activeVehicleId).catch(() => void 0);
    if (vehicle && vehicle.status === "approved" && Number(vehicle.vehicleYear || 0) >= 2015) {
      return vehicle;
    }
    return null;
  }
  async function getEligibleChauffeursForRide(ride, options = {}) {
    const pickupLat = Number(ride.pickupLat);
    const pickupLng = Number(ride.pickupLng);
    const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
    const skipped = options.excludeSkipped ? skippedChauffeursByRide.get(ride.id) : null;
    const chauffeurs2 = await storage.getAllChauffeurs();
    const eligible = [];
    for (const chauffeur of chauffeurs2) {
      if (!chauffeur?.isOnline || !chauffeur?.isApproved) continue;
      if (skipped?.has(chauffeur.id)) continue;
      if (hasPickup && !hasFreshChauffeurLocation(chauffeur)) continue;
      const activeVehicle = await getApprovedActiveVehicle(chauffeur);
      if (!activeVehicle || !isVehicleEligibleForRide(ride.vehicleType || "budget", activeVehicle.vehicleType)) {
        continue;
      }
      const distKm = hasPickup ? calculateHaversineDistanceKm(pickupLat, pickupLng, Number(chauffeur.lat), Number(chauffeur.lng)) : 0;
      if (hasPickup && distKm > RIDE_MATCH_RADIUS_KM) continue;
      eligible.push({ ...chauffeur, activeVehicle, distKm });
    }
    return eligible.sort((a, b) => Number(a.distKm || 0) - Number(b.distKm || 0));
  }
  async function countActiveDemandForRide(ride) {
    const pickupLat = Number(ride.pickupLat);
    const pickupLng = Number(ride.pickupLng);
    const hasPickup = Number.isFinite(pickupLat) && Number.isFinite(pickupLng);
    const allRides = await storage.getAllRides();
    return allRides.filter((candidate) => {
      if (candidate.id === ride.id || !["requested", "searching"].includes(candidate.status) || !isVehicleEligibleForRide(candidate.vehicleType || "budget", ride.vehicleType || "budget")) {
        return false;
      }
      if (!hasPickup) return true;
      const candidateLat = Number(candidate.pickupLat);
      const candidateLng = Number(candidate.pickupLng);
      if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLng)) {
        return false;
      }
      return calculateHaversineDistanceKm(pickupLat, pickupLng, candidateLat, candidateLng) <= RIDE_MATCH_RADIUS_KM;
    }).length + 1;
  }
  const DISPATCH_RETRY_MS = 15e3;
  const DISPATCH_MAX_SEARCH_WINDOW_MS = 15 * 60 * 1e3;
  const RESERVATION_DISPATCH_LEAD_MS = 20 * 60 * 1e3;
  const RESERVATION_CANCELLATION_FEE_RATE = 0.5;
  function getRideCreatedAtMs(ride) {
    const ms = new Date(ride?.createdAt ?? 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  function scheduleDispatchRetry(rideId) {
    const existingTimer = dispatchTimers.get(rideId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(async () => {
      dispatchTimers.delete(rideId);
      try {
        const ride = await storage.getRide(rideId);
        if (!ride || ride.status !== "searching") return;
        await dispatchNextRideOffer(ride);
      } catch (error) {
        console.error("[dispatch] retry failed:", error.message);
      }
    }, DISPATCH_RETRY_MS);
    dispatchTimers.set(rideId, timer);
  }
  let dispatchPumpRunning = false;
  async function pumpUnassignedSearchingRides() {
    if (dispatchPumpRunning) return;
    dispatchPumpRunning = true;
    try {
      const allRides = await storage.getAllRides();
      const now = Date.now();
      for (const ride of allRides) {
        if (ride.status === "reserved" && ride.scheduledFor) {
          const scheduledMs2 = new Date(ride.scheduledFor).getTime();
          if (Number.isFinite(scheduledMs2) && now >= scheduledMs2 - RESERVATION_DISPATCH_LEAD_MS) {
            const promoted = await storage.updateRide(ride.id, { status: "searching" }).catch(() => null);
            if (promoted) {
              ride.status = "searching";
              try {
                const rider = await storage.getUser(ride.clientId);
                if (rider?.pushToken) {
                  sendExpoPushNotification(
                    [rider.pushToken],
                    "Your reserved ride is starting",
                    "We're finding your driver now.",
                    { rideId: ride.id, type: "ride:reserved_dispatch" },
                    { urgent: true, channelId: "client-alerts" }
                  );
                }
              } catch {
              }
            }
          } else {
            continue;
          }
        }
        if (ride.status !== "searching") continue;
        const scheduledMs = ride.scheduledFor ? new Date(ride.scheduledFor).getTime() : NaN;
        const referenceMs = Number.isFinite(scheduledMs) ? scheduledMs : getRideCreatedAtMs(ride);
        if (!referenceMs || now - referenceMs > DISPATCH_MAX_SEARCH_WINDOW_MS) continue;
        if (ride.currentOfferedChauffeurId && isRideOfferActive(ride, ride.currentOfferedChauffeurId)) {
          continue;
        }
        if (dispatchTimers.has(ride.id)) continue;
        await dispatchNextRideOffer(ride);
      }
    } catch (error) {
      console.error("[dispatch] pump failed:", error.message);
    } finally {
      dispatchPumpRunning = false;
    }
  }
  setInterval(pumpUnassignedSearchingRides, 2e4);
  function scheduleOfferExpiry(rideId) {
    const existingTimer = dispatchTimers.get(rideId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(async () => {
      dispatchTimers.delete(rideId);
      try {
        const ride = await storage.getRide(rideId);
        if (!ride || ride.status !== "searching") return;
        if (ride.currentOfferedChauffeurId && isRideOfferActive(ride, ride.currentOfferedChauffeurId, /* @__PURE__ */ new Date())) {
          scheduleOfferExpiry(rideId);
          return;
        }
        if (ride.currentOfferedChauffeurId) {
          const skipped = skippedChauffeursByRide.get(rideId) || /* @__PURE__ */ new Set();
          skipped.add(ride.currentOfferedChauffeurId);
          skippedChauffeursByRide.set(rideId, skipped);
        }
        await dispatchNextRideOffer(ride);
      } catch (error) {
        console.error("[dispatch] offer expiry failed:", error.message);
      }
    }, 46e3);
    dispatchTimers.set(rideId, timer);
  }
  async function dispatchNextRideOffer(ride) {
    const latestRide = await storage.getRide(ride.id);
    if (!latestRide || latestRide.status !== "searching") return { offered: null, ride: latestRide };
    let eligible = await getEligibleChauffeursForRide(latestRide, { excludeSkipped: true });
    if (!eligible.length && skippedChauffeursByRide.get(latestRide.id)?.size) {
      skippedChauffeursByRide.delete(latestRide.id);
      eligible = await getEligibleChauffeursForRide(latestRide, { excludeSkipped: true });
    }
    if (!eligible.length) {
      const updated2 = await storage.updateRide(latestRide.id, {
        currentOfferedChauffeurId: null,
        currentOfferExpiresAt: null
      });
      if (Date.now() - getRideCreatedAtMs(latestRide) <= DISPATCH_MAX_SEARCH_WINDOW_MS) {
        scheduleDispatchRetry(latestRide.id);
      }
      return { offered: null, ride: updated2 || latestRide };
    }
    const offered = eligible[0];
    const expiresAt = getRideOfferExpiresAt();
    const updated = await storage.updateRide(latestRide.id, {
      dispatchStartedAt: latestRide.dispatchStartedAt || /* @__PURE__ */ new Date(),
      currentOfferedChauffeurId: offered.id,
      currentOfferExpiresAt: expiresAt
    });
    let clientFirstName = "Rider";
    try {
      const client = await storage.getUser(latestRide.clientId);
      clientFirstName = getUserFirstName(client, "Rider");
    } catch {
    }
    const offerPayload = {
      ...updated || latestRide,
      clientFirstName,
      distanceToPickup: offered.distKm,
      currentOfferExpiresAt: expiresAt,
      assignedVehicleType: offered.activeVehicle?.vehicleType || null
    };
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
      const socketData = socket.data;
      if (socketData?.chauffeurId === offered.id) {
        socket.emit("ride:new", offerPayload);
      }
    }
    const pushTokens = await getDriverPushTokens([offered]);
    if (pushTokens.length > 0) {
      sendExpoPushNotification(
        pushTokens,
        "\u{1F697} New Ride Request",
        `Pickup: ${latestRide.pickupAddress || "Nearby"} \u2014 45 seconds to accept`,
        { rideId: latestRide.id, type: "ride:new" },
        { urgent: true }
      );
    }
    scheduleOfferExpiry(latestRide.id);
    return { offered, ride: updated || latestRide };
  }
  app2.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app2.get("/api/config", (_req, res) => {
    res.json({
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || ""
    });
  });
  app2.post("/api/airport-transfers/book", requireAuth, async (req, res) => {
    try {
      const { airport, destination, date, time, flightNumber, passengers, phone } = req.body || {};
      if (!airport || !destination || !date || !time) {
        return res.status(400).json({ message: "Airport, destination, date, and time are required" });
      }
      const rider = await storage.getUser(req.auth.sub);
      if (!rider) return res.status(404).json({ message: "User not found" });
      const riderName = rider.name || rider.username || "Passenger";
      const summary = `${airport} \u2192 ${destination} on ${date} at ${time}${flightNumber ? ` (Flight: ${flightNumber})` : ""}`;
      await storage.createNotification({
        userId: rider.id,
        title: "Airport transfer requested",
        body: `Your transfer: ${summary}. Our team will confirm your chauffeur shortly.`,
        type: "airport_transfer"
      });
      try {
        const allUsers = await storage.getAllUsers();
        const admins = (allUsers || []).filter((u) => u.role === "admin");
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            title: "New airport transfer booking",
            body: `${riderName}: ${summary}. Passengers: ${passengers || 1}. Phone: ${phone || "N/A"}`,
            type: "airport_transfer"
          });
          if (admin.pushToken) {
            sendExpoPushNotification(
              [admin.pushToken],
              "New airport transfer",
              `${riderName} booked: ${summary}`,
              { type: "airport_transfer", riderId: rider.id, airport, destination, date, time, phone: phone || "" },
              { urgent: true, channelId: "ride-alerts-v3" }
            );
          }
        }
      } catch (e) {
      }
      return res.json({ success: true, message: "Transfer request received. You will be contacted to confirm." });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Could not save airport transfer" });
    }
  });
  app2.get("/api/airport-transfers/my", requireAuth, async (req, res) => {
    try {
      const notifications2 = await storage.getNotificationsByUser(req.auth.sub);
      const transfers = notifications2.filter((n) => n.type === "airport_transfer");
      return res.json(transfers);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  function getUserFirstName(user, fallback = "Rider") {
    const candidates = [user?.name, user?.username].filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim());
    for (const candidate of candidates) {
      const normalized = candidate.includes("@") ? candidate.split("@")[0] : candidate;
      const first = normalized.replace(/[._-]+/g, " ").split(/\s+/).find(Boolean);
      if (!first) continue;
      const lowered = first.toLowerCase();
      if (["a2b", "client", "rider", "user", "oauth"].includes(lowered)) continue;
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
    return fallback;
  }
  let clientRatingsReady = null;
  function ensureClientRatingsTable() {
    if (!clientRatingsReady) {
      clientRatingsReady = (async () => {
        await pool2.query(`
          CREATE TABLE IF NOT EXISTS client_ratings (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            ride_id varchar NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
            client_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            chauffeur_id varchar NOT NULL REFERENCES chauffeurs(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment text,
            created_at timestamp DEFAULT now()
          )
        `);
        await pool2.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_client_ratings_ride_chauffeur_unique
          ON client_ratings (ride_id, chauffeur_id)
        `);
        await pool2.query(`
          CREATE INDEX IF NOT EXISTS idx_client_ratings_client_id
          ON client_ratings (client_id)
        `);
      })().catch((error) => {
        clientRatingsReady = null;
        throw error;
      });
    }
    return clientRatingsReady;
  }
  function normalizeReferralCode(rawValue) {
    return String(rawValue || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  async function generateUniqueReferralCode(name, email) {
    const seed = normalizeReferralCode(name || email || "A2B") || "A2B";
    const base = seed.slice(0, 6);
    for (let attempt = 0; attempt < 30; attempt++) {
      const suffix = Math.floor(1e3 + Math.random() * 9e3).toString();
      const candidate = `${base}${suffix}`;
      const existing = await storage.getUserByReferralCode(candidate);
      if (!existing) return candidate;
    }
    return `${base}${Date.now().toString().slice(-6)}`;
  }
  async function getUserRewardsBalance(userId) {
    try {
      const result = await pool2.query(
        "SELECT COALESCE(rewards_balance, 0) AS rewards_balance FROM users WHERE id = $1 LIMIT 1",
        [userId]
      );
      return Number(result.rows?.[0]?.rewards_balance || 0);
    } catch {
      return 0;
    }
  }
  async function ensureUserReferralCode(user) {
    const existing = normalizeReferralCode(user?.referralCode || user?.referral_code);
    if (existing) return existing;
    const generated = await generateUniqueReferralCode(user?.name || "A2B", user?.username || "");
    try {
      await pool2.query("UPDATE users SET referral_code = $1 WHERE id = $2", [generated, user.id]);
      return generated;
    } catch {
      return generated;
    }
  }
  async function hydrateAuthUser(user) {
    const { password: _pw, ...safeUser } = user;
    const referralCode = await ensureUserReferralCode(user);
    const rewardsBalance = Number(
      safeUser?.rewardsBalance ?? safeUser?.rewards_balance ?? await getUserRewardsBalance(user.id)
    );
    const liftClubMembership = await storage.getLiftClubMembershipByUser(user.id).catch(() => void 0);
    return {
      ...safeUser,
      referralCode,
      rewardsBalance,
      liftClubMembership: liftClubMembership ? {
        id: liftClubMembership.id,
        status: liftClubMembership.status,
        feeAmount: liftClubMembership.feeAmount,
        rejectionReason: liftClubMembership.rejectionReason,
        proofDocumentId: liftClubMembership.proofDocumentId,
        isApproved: liftClubMembership.status === "approved"
      } : null
    };
  }
  const LIFT_CLUB_APPLICATION_FEE = 200;
  const LIFT_CLUB_MEMBERSHIP_REFERRAL_BONUS = 100;
  const LIFT_CLUB_BANKING_DETAILS_URL = "https://a2blift.com/lift-club-payment.html";
  function serializeLiftClubMembership(membership) {
    if (!membership) {
      return {
        status: "not_applied",
        feeAmount: LIFT_CLUB_APPLICATION_FEE,
        proofDocument: null,
        rejectionReason: null,
        isApproved: false,
        bankingDetailsUrl: LIFT_CLUB_BANKING_DETAILS_URL
      };
    }
    return {
      ...membership,
      feeAmount: Number(membership.feeAmount || membership.fee_amount || LIFT_CLUB_APPLICATION_FEE),
      isApproved: membership.status === "approved",
      bankingDetailsUrl: LIFT_CLUB_BANKING_DETAILS_URL
    };
  }
  async function notifyAdmins(title, body, type = "admin") {
    const admins = (await storage.getAllUsers()).filter((admin) => admin.role === "admin");
    await Promise.all(admins.map((admin) => storage.createNotification({
      userId: admin.id,
      title,
      body,
      type,
      isRead: false
    }).catch(() => void 0)));
  }
  async function creditLiftClubMembershipReferralBonus(referredUserId, membershipId) {
    const referredUser = await storage.getUser(referredUserId);
    const referrerUserId = referredUser?.referredByUserId;
    if (!referredUser || !referrerUserId) return;
    const reference = `lift_club_membership_bonus_${membershipId}`;
    const existing = await storage.getRewardTransactionByReference(reference);
    if (existing) return;
    const referrer = await storage.getUser(referrerUserId);
    if (!referrer) return;
    const reward = LIFT_CLUB_MEMBERSHIP_REFERRAL_BONUS;
    const balanceBefore = Number(referrer.rewardsBalance || 0);
    const balanceAfter = Math.round((balanceBefore + reward) * 100) / 100;
    const referralEvent = await storage.getReferralEventByReferredUserId(referredUser.id);
    await storage.updateUser(referrer.id, { rewardsBalance: balanceAfter });
    await storage.createRewardTransaction({
      userId: referrer.id,
      referralEventId: referralEvent?.id || null,
      sourceUserId: referredUser.id,
      rideId: null,
      reference,
      amount: reward,
      balanceBefore,
      balanceAfter,
      type: "lift_club_membership_bonus",
      description: `${referredUser.name || "A referred member"} was approved as a Lift Club member after payment review.`,
      status: "completed"
    });
    if (referralEvent) {
      await storage.updateReferralEvent(referralEvent.id, {
        totalRewards: Number(referralEvent.totalRewards || 0) + reward,
        lastRewardAt: /* @__PURE__ */ new Date(),
        status: "active"
      });
    }
    await storage.createNotification({
      userId: referrer.id,
      title: "Lift Club Reward",
      body: `You earned R${reward.toFixed(2)} because your invited member was approved for Lift Club.`,
      type: "reward"
    });
  }
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, name, phone, role, referralCode } = req.body;
      const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
      if (!username || !password || !name) {
        return res.status(400).json({ message: "Email, password, name, and phone number are required" });
      }
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      const email = username.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address" });
      }
      const existing = await storage.getUserByUsername(email);
      if (existing) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      let referrerUser;
      const normalizedReferralCode = referralCode?.trim().toUpperCase();
      if (normalizedReferralCode) {
        referrerUser = await storage.getUserByReferralCode(normalizedReferralCode);
      }
      const hashedPassword = await import_bcryptjs.default.hash(password, 10);
      const user = await storage.createUser({
        username: email,
        password: hashedPassword,
        name: name.trim(),
        phone: normalizedPhone,
        role: role || "client",
        ...referrerUser ? { referredByUserId: referrerUser.id } : {}
      });
      if (referrerUser) {
        try {
          await storage.createReferralEvent({
            referrerUserId: referrerUser.id,
            referredUserId: user.id,
            referralCodeUsed: normalizedReferralCode,
            status: "registered"
          });
        } catch (refErr) {
          console.warn("createReferralEvent non-fatal:", refErr.message);
        }
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const safeUser = await hydrateAuthUser(user);
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "An account with this email already exists" });
      }
      if (error.code === "42P01") {
        return res.status(500).json({ message: "Database table not found. Please run: npm run db:push" });
      }
      return res.status(500).json({ message: error.message || "Registration failed. Please try again." });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = await import_bcryptjs.default.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const safeUser = await hydrateAuthUser(user);
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/auth/logout", async (_req, res) => {
    res.clearCookie("a2b_token", { path: "/" });
    return res.json({ ok: true });
  });
  app2.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.auth.sub);
    if (!user) return res.status(404).json({ message: "User not found" });
    const safeUser = await hydrateAuthUser(user);
    return res.json(safeUser);
  });
  app2.delete("/api/auth/me", requireAuth, async (req, res) => {
    const userId = req.auth.sub;
    const client = await pool2.connect();
    const maybeQuery = async (query, params = []) => {
      try {
        return await client.query(query, params);
      } catch (error) {
        if (error?.code === "42P01" || error?.code === "42703") return null;
        throw error;
      }
    };
    try {
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const chauffeurRows = await pool2.query("SELECT id FROM chauffeurs WHERE user_id = $1", [userId]);
      const chauffeurIds = chauffeurRows.rows.map((row) => row.id).filter(Boolean);
      const activeRideStatuses = ["requested", "accepted", "arrived", "in_progress", "en_route"];
      const activeRideCheck = await pool2.query(
        `
          SELECT id
          FROM rides
          WHERE (client_id = $1 OR chauffeur_id = ANY($2::varchar[]))
            AND status = ANY($3::text[])
          LIMIT 1
        `,
        [userId, chauffeurIds, activeRideStatuses]
      );
      if (activeRideCheck.rowCount && activeRideCheck.rowCount > 0) {
        return res.status(409).json({ message: "Please complete or cancel any active trip before deleting your account." });
      }
      const deletedEmail = `deleted-${userId}@deleted.a2b.local`;
      const deletedPassword = await import_bcryptjs.default.hash(import_node_crypto.default.randomBytes(32).toString("hex"), 10);
      await client.query("BEGIN");
      await maybeQuery("DELETE FROM notifications WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM saved_cards WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM wallet_transactions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM messages WHERE sender_id = $1", [userId]);
      await maybeQuery("DELETE FROM safety_reports WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM trip_enquiries WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM liveness_sessions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM documents WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM lift_club_bookings WHERE rider_id = $1", [userId]);
      await maybeQuery(
        `
          DELETE FROM lift_club_bookings
          WHERE route_id IN (
            SELECT id FROM lift_club_routes WHERE chauffeur_id = ANY($1::varchar[])
          )
        `,
        [chauffeurIds]
      );
      await maybeQuery("DELETE FROM lift_club_routes WHERE chauffeur_id = ANY($1::varchar[])", [chauffeurIds]);
      await maybeQuery("UPDATE payments SET paystack_auth_code = NULL WHERE payer_user_id = $1", [userId]);
      await maybeQuery(
        `
          UPDATE reward_transactions
          SET source_user_id = NULL
          WHERE source_user_id = $1
        `,
        [userId]
      );
      await maybeQuery(
        `
          UPDATE reward_transactions
          SET referral_event_id = NULL
          WHERE referral_event_id IN (
            SELECT id
            FROM referral_events
            WHERE referrer_user_id = $1 OR referred_user_id = $1
          )
        `,
        [userId]
      );
      await maybeQuery("DELETE FROM reward_transactions WHERE user_id = $1", [userId]);
      await maybeQuery("DELETE FROM reward_cashouts WHERE user_id = $1 OR reviewed_by_admin_id = $1", [userId]);
      await maybeQuery("DELETE FROM referral_events WHERE referrer_user_id = $1 OR referred_user_id = $1", [userId]);
      await maybeQuery(
        `
          UPDATE driver_applications
          SET status = 'withdrawn',
              notes = 'Applicant deleted their account.',
              reviewed_at = NOW(),
              reviewer_admin_id = NULL
          WHERE user_id = $1
        `,
        [userId]
      );
      await maybeQuery(
        `
          UPDATE chauffeurs
          SET is_online = false,
              is_approved = false,
              available_for_long_distance = false,
              long_distance_from = NULL,
              long_distance_to = NULL,
              long_distance_date = NULL,
              long_distance_price_per_seat = NULL,
              long_distance_seats_available = 0,
              phone = NULL,
              profile_photo = NULL,
              push_token = NULL,
              lat = NULL,
              lng = NULL,
              location_updated_at = NULL,
              car_make = 'Deleted',
              vehicle_model = 'Deleted',
              plate_number = 'Deleted',
              vehicle_type = 'Deleted',
              car_color = 'Deleted'
          WHERE user_id = $1
        `,
        [userId]
      );
      await maybeQuery(
        `
          UPDATE users
          SET username = $2,
              password = $3,
              name = 'Deleted Account',
              phone = NULL,
              profile_photo = NULL,
              push_token = NULL,
              referral_code = NULL,
              referred_by_user_id = NULL,
              rewards_balance = 0,
              wallet_balance = 0
          WHERE id = $1
        `,
        [userId, deletedEmail, deletedPassword]
      );
      await client.query("COMMIT");
      res.clearCookie("a2b_token", { path: "/" });
      return res.json({ ok: true, message: "Account deleted" });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
      }
      return res.status(500).json({ message: error.message || "Account deletion failed" });
    } finally {
      client.release();
    }
  });
  app2.get("/api/referrals/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.auth.sub);
      if (!user) return res.status(404).json({ message: "User not found" });
      const hydratedUser = await hydrateAuthUser(user);
      const [referralEvents2, transactions, cashouts] = await Promise.all([
        storage.getReferralEventsByReferrerUserId(user.id),
        storage.getRewardTransactions(user.id),
        storage.getRewardCashoutsByUser(user.id)
      ]);
      const referredUserIds = (referralEvents2 || []).map((event) => event.referredUserId).filter(Boolean);
      const referredUsersMap = /* @__PURE__ */ new Map();
      if (referredUserIds.length > 0) {
        try {
          const result = await pool2.query(
            "SELECT id, name FROM users WHERE id = ANY($1)",
            [referredUserIds]
          );
          for (const row of result.rows) {
            referredUsersMap.set(row.id, row);
          }
        } catch {
        }
      }
      const referredPeople = (referralEvents2 || []).map((event) => {
        const referredUser = event?.referredUserId ? referredUsersMap.get(event.referredUserId) : null;
        return {
          id: event.id,
          name: referredUser?.name || "A2B User",
          joinedAt: event.createdAt,
          firstRewardAt: event.firstRewardAt || null,
          lastRewardAt: event.lastRewardAt || null,
          rewardedAt: event.status === "rewarded" ? event.lastRewardAt || event.firstRewardAt || event.updatedAt || event.createdAt : null,
          totalRewards: Number(event.totalRewards || 0),
          status: event.status || "registered"
        };
      });
      const totalRewardsEarned = (transactions || []).filter((tx) => Number(tx.amount || 0) > 0 && tx.status !== "failed").reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const pendingCashoutAmount = (cashouts || []).filter((cashout) => ["pending", "processing"].includes(String(cashout.status || "").toLowerCase())).reduce((sum, cashout) => sum + Number(cashout.amount || 0), 0);
      const rewardedReferrals = (referralEvents2 || []).filter(
        (event) => Number(event.totalRewards || 0) > 0 || event.status === "rewarded"
      ).length;
      const referralBase = process.env.EXPO_PUBLIC_REFERRAL_LINK_BASE_URL || process.env.EXPO_PUBLIC_DOMAIN || "https://api.a2blift.com";
      const rewardApp = hydratedUser.role === "chauffeur" ? "driver" : "client";
      return res.json({
        referralCode: hydratedUser.referralCode,
        shareUrl: `${String(referralBase).replace(/\/$/, "")}/r/${encodeURIComponent(hydratedUser.referralCode)}?app=${encodeURIComponent(rewardApp)}`,
        rewardsBalance: Number(hydratedUser.rewardsBalance || 0),
        referredCount: referralEvents2.length,
        rewardedReferrals,
        totalRewardsEarned,
        pendingCashoutAmount,
        referredPeople,
        transactions,
        cashouts
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to load referral dashboard" });
    }
  });
  app2.get("/api/rewards/transactions", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getRewardTransactions(req.auth.sub);
      return res.json(rows || []);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to load reward transactions" });
    }
  });
  app2.get("/api/rewards/cashouts", requireAuth, async (req, res) => {
    try {
      const rows = await storage.getRewardCashoutsByUser(req.auth.sub);
      return res.json(rows || []);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to load reward cashouts" });
    }
  });
  app2.post("/api/rewards/cashout", requireAuth, async (req, res) => {
    try {
      const amount = Number(req.body?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      if (amount < 100) {
        return res.status(400).json({ message: "Minimum cash-out amount is R 100.00" });
      }
      const balance = await getUserRewardsBalance(req.auth.sub);
      if (amount > balance) {
        return res.status(400).json({ message: "Requested amount exceeds available rewards balance" });
      }
      const created = await storage.createRewardCashout({
        userId: req.auth.sub,
        amount,
        bankName: req.body?.bankName || null,
        accountHolder: req.body?.accountHolder || null,
        accountNumber: req.body?.accountNumber || null,
        status: "pending"
      });
      return res.status(201).json(created);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to submit cash-out request" });
    }
  });
  const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_WEB_SERVICE_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
  const PHOTON_BASE_URL = "https://photon.komoot.io/api";
  const MAPS_USER_AGENT = "A2B-LIFT/1.0 (support@a2blift.app)";
  const GOOGLE_AUTOCOMPLETE_FIELD_MASK = [
    "suggestions.placePrediction.placeId",
    "suggestions.placePrediction.text.text",
    "suggestions.placePrediction.structuredFormat.mainText.text",
    "suggestions.placePrediction.structuredFormat.secondaryText.text",
    "suggestions.placePrediction.types",
    "suggestions.queryPrediction.text.text"
  ].join(",");
  const GOOGLE_PLACE_DETAILS_FIELD_MASK = [
    "id",
    "displayName.text",
    "formattedAddress",
    "location.latitude",
    "location.longitude"
  ].join(",");
  const DIRECTIONS_CACHE_TTL_MS = 5 * 60 * 1e3;
  const DIRECTIONS_CACHE_MAX_ENTRIES = 250;
  const directionsCache = /* @__PURE__ */ new Map();
  const SA_DEFAULT_BIAS = { lat: -25.7479, lng: 28.2293 };
  const SOUTH_AFRICAN_CITY_SUGGESTIONS = [
    ["Pretoria", "Gauteng", -25.7479, 28.2293],
    ["Johannesburg", "Gauteng", -26.2041, 28.0473],
    ["Sandton", "Gauteng", -26.1076, 28.0567],
    ["Midrand", "Gauteng", -25.9992, 28.1263],
    ["Centurion", "Gauteng", -25.864, 28.1881],
    ["Soweto", "Gauteng", -26.2485, 27.854],
    ["Benoni", "Gauteng", -26.1885, 28.3208],
    ["Boksburg", "Gauteng", -26.2326, 28.24],
    ["Kempton Park", "Gauteng", -26.1, 28.2333],
    ["Roodepoort", "Gauteng", -26.1625, 27.8725],
    ["Vereeniging", "Gauteng", -26.6731, 27.9261],
    ["Cape Town", "Western Cape", -33.9249, 18.4241],
    ["Stellenbosch", "Western Cape", -33.9321, 18.8602],
    ["Paarl", "Western Cape", -33.7342, 18.9621],
    ["George", "Western Cape", -33.9648, 22.4617],
    ["Durban", "KwaZulu-Natal", -29.8587, 31.0218],
    ["Pietermaritzburg", "KwaZulu-Natal", -29.6006, 30.3794],
    ["Richards Bay", "KwaZulu-Natal", -28.7807, 32.0383],
    ["Newcastle", "KwaZulu-Natal", -27.757, 29.9318],
    ["Bloemfontein", "Free State", -29.0852, 26.1596],
    ["Welkom", "Free State", -27.9777, 26.7351],
    ["Gqeberha", "Eastern Cape", -33.9608, 25.6022],
    ["Port Elizabeth", "Eastern Cape", -33.9608, 25.6022],
    ["East London", "Eastern Cape", -33.0192, 27.8999],
    ["Mthatha", "Eastern Cape", -31.5889, 28.7844],
    ["Polokwane", "Limpopo", -23.9045, 29.4689],
    ["Tzaneen", "Limpopo", -23.8332, 30.1635],
    ["Thohoyandou", "Limpopo", -22.9456, 30.4849],
    ["Mbombela", "Mpumalanga", -25.4753, 30.9694],
    ["Nelspruit", "Mpumalanga", -25.4753, 30.9694],
    ["Witbank", "Mpumalanga", -25.877, 29.201],
    ["Emalahleni", "Mpumalanga", -25.877, 29.201],
    ["Rustenburg", "North West", -25.6676, 27.2421],
    ["Mahikeng", "North West", -25.8652, 25.6442],
    ["Klerksdorp", "North West", -26.8521, 26.6667],
    ["Kimberley", "Northern Cape", -28.7282, 24.7499],
    ["Upington", "Northern Cape", -28.4478, 21.2561]
  ];
  async function fetchMapsJson(url) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "User-Agent": MAPS_USER_AGENT
      }
    });
    const rawBody = await response.text();
    if (!rawBody) return null;
    try {
      return JSON.parse(rawBody);
    } catch {
      const provider = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "maps-provider";
        }
      })();
      const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 80);
      throw new Error(`Invalid JSON from ${provider}: ${preview}`);
    }
  }
  async function fetchMapsJsonSafely(url) {
    try {
      return await fetchMapsJson(url);
    } catch (error) {
      console.warn(
        "[maps] Upstream maps response was not valid JSON:",
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
  async function fetchMapsJsonPost(url, body, headers) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "Content-Type": "application/json",
        "User-Agent": MAPS_USER_AGENT,
        ...headers
      },
      body: JSON.stringify(body)
    });
    const rawBody = await response.text();
    if (!rawBody) return null;
    try {
      return JSON.parse(rawBody);
    } catch {
      const provider = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "maps-provider";
        }
      })();
      const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 80);
      throw new Error(`Invalid JSON from ${provider}: ${preview}`);
    }
  }
  async function fetchMapsJsonPostSafely(url, body, headers) {
    try {
      return await fetchMapsJsonPost(url, body, headers);
    } catch (error) {
      console.warn(
        "[maps] Upstream maps response was not valid JSON:",
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }
  function normalizeCoordinate(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Number(value.toFixed(4));
  }
  function buildDirectionsCacheKey(originLat, originLng, destLat, destLng) {
    const normalized = [originLat, originLng, destLat, destLng].map(normalizeCoordinate);
    if (normalized.some((value) => value == null)) return null;
    return normalized.join(":");
  }
  function getDirectionsCacheEntry(cacheKey) {
    const cached = directionsCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      directionsCache.delete(cacheKey);
      return null;
    }
    return cached.payload;
  }
  function setDirectionsCacheEntry(cacheKey, payload) {
    directionsCache.set(cacheKey, {
      expiresAt: Date.now() + DIRECTIONS_CACHE_TTL_MS,
      payload
    });
    if (directionsCache.size <= DIRECTIONS_CACHE_MAX_ENTRIES) return;
    for (const [key, entry] of directionsCache) {
      if (entry.expiresAt <= Date.now()) {
        directionsCache.delete(key);
      }
    }
    while (directionsCache.size > DIRECTIONS_CACHE_MAX_ENTRIES) {
      const oldestKey = directionsCache.keys().next().value;
      if (!oldestKey) break;
      directionsCache.delete(oldestKey);
    }
  }
  function sanitizeAddressAutocompleteParts(parts) {
    return parts.reduce((cleaned, part) => {
      if (typeof part !== "string") return cleaned;
      const trimmedPart = part.trim();
      if (!trimmedPart) return cleaned;
      if (/\b(ward\b|municipality|district municipality|administrative area)\b/i.test(trimmedPart)) {
        return cleaned;
      }
      if (cleaned.includes(trimmedPart)) return cleaned;
      cleaned.push(trimmedPart);
      return cleaned;
    }, []);
  }
  function formatNominatimAddress(address, fallbackDisplayName) {
    const primary = [address?.house_number, address?.road].filter(Boolean).join(" ").trim();
    const locality = sanitizeAddressAutocompleteParts([
      address?.suburb,
      address?.city || address?.town || address?.village,
      address?.state
    ]).join(", ").trim();
    const description = [primary, locality].filter(Boolean).join(", ") || fallbackDisplayName || "";
    return {
      description,
      mainText: primary || fallbackDisplayName?.split(",")[0] || "Pinned location",
      secondaryText: locality || fallbackDisplayName?.split(",").slice(1).join(", ").trim() || "South Africa"
    };
  }
  function isCityLikeNominatimResult(result) {
    const type = String(result?.type || result?.addresstype || "").toLowerCase();
    const className = String(result?.class || "").toLowerCase();
    const cityTypes = ["city", "town", "village", "municipality", "hamlet", "suburb"];
    return cityTypes.includes(type) || className === "place" && cityTypes.includes(type);
  }
  function isValidCoordinate(value) {
    const n = Number(value);
    return Number.isFinite(n);
  }
  const ADDRESS_TERM_NORMALIZATIONS = [
    [/\bpretoriou+s\b/gi, "Pretorius"],
    [/\bpretorious\b/gi, "Pretorius"],
    [/\bpretoriaus\b/gi, "Pretorius"],
    [/\bst\.?\b/gi, "Street"],
    [/\bave\.?\b/gi, "Avenue"],
    [/\brd\.?\b/gi, "Road"],
    [/\bdr\.?\b/gi, "Drive"],
    [/\bln\.?\b/gi, "Lane"],
    [/\bcl\.?\b/gi, "Close"],
    [/\bblvd\.?\b/gi, "Boulevard"],
    [/\bcres\.?\b/gi, "Crescent"]
  ];
  const NON_DISTINCT_ADDRESS_TOKENS = /* @__PURE__ */ new Set([
    "south",
    "africa",
    "street",
    "avenue",
    "road",
    "drive",
    "lane",
    "close",
    "boulevard",
    "crescent",
    "city",
    "town"
  ]);
  const ADDRESS_SEARCH_TYPE_HINTS = ["Street", "Avenue", "Road", "Drive", "Lane", "Close"];
  const ADDRESS_AUTOCOMPLETE_RESULT_LIMIT = 10;
  function normalizeMapsQuery(value) {
    return ADDRESS_TERM_NORMALIZATIONS.reduce(
      (normalized, [pattern, replacement]) => normalized.replace(pattern, replacement),
      value.trim()
    ).replace(/\s+/g, " ");
  }
  function extractAddressTokens(value, minimumLength = 3) {
    return normalizeMapsQuery(value).toLowerCase().match(new RegExp(`[a-z]{${minimumLength},}`, "g"))?.filter((token) => !NON_DISTINCT_ADDRESS_TOKENS.has(token)) || [];
  }
  function getLeadingAddressNumber(value) {
    return normalizeMapsQuery(value).match(/^\d+\b/)?.[0] || "";
  }
  function stripLeadingAddressNumber(value) {
    return normalizeMapsQuery(value).replace(/^\d+\s+/, "").trim();
  }
  function getPredictionPrimaryLine(prediction) {
    const mainText = normalizeMapsQuery(prediction.mainText || "");
    const descriptionPrimary = normalizeMapsQuery(prediction.description.split(",")[0] || "");
    return getLeadingAddressNumber(mainText) ? mainText : descriptionPrimary || mainText;
  }
  function hasMismatchedPrimaryAddressNumber(prediction, expectedNumber) {
    if (!expectedNumber) return false;
    const primaryNumber = getLeadingAddressNumber(getPredictionPrimaryLine(prediction));
    return Boolean(primaryNumber && primaryNumber !== expectedNumber);
  }
  function hasStackedPrimaryAddressNumbers(prediction) {
    return /^\d+\s+\d+\b/.test(getPredictionPrimaryLine(prediction));
  }
  function predictionMatchesAddressPrefixes(prediction, prefixes) {
    if (prefixes.length === 0) return true;
    const primaryWords = normalizeMapsQuery(
      `${prediction.mainText} ${prediction.description.split(",")[0] || ""}`
    ).toLowerCase().match(/[a-z]{1,}/g) || [];
    return prefixes.every((prefix) => primaryWords.some((word) => word.startsWith(prefix)));
  }
  function chooseBestReverseGeocodeResult(results) {
    return [...results].sort((left, right) => {
      const score = (result) => {
        const types = Array.isArray(result?.types) ? result.types : [];
        const components = Array.isArray(result?.address_components) ? result.address_components : [];
        const formattedAddress = normalizeMapsQuery(result?.formatted_address || "").toLowerCase();
        const hasType = (type) => types.includes(type);
        const hasComponent = (type) => components.some((component) => component?.types?.includes(type) && component?.long_name);
        const hasSuburbLikeComponent = hasComponent("sublocality_level_1") || hasComponent("sublocality") || hasComponent("neighborhood");
        const hasCityLikeComponent = hasComponent("locality") || hasComponent("administrative_area_level_2");
        let total = 0;
        if (hasType("street_address")) total += 160;
        if (hasType("premise")) total += 90;
        if (hasType("establishment") || hasType("point_of_interest")) total += 70;
        if (hasType("subpremise")) total += 70;
        if (hasType("route")) total += 60;
        if (hasComponent("street_number")) total += 55;
        if (hasComponent("route")) total += 45;
        if (hasSuburbLikeComponent) total += 28;
        if (hasCityLikeComponent) total += 18;
        if (hasType("plus_code")) total -= 40;
        if (hasType("political")) total -= 25;
        if (/\bward\b/.test(formattedAddress)) total -= 160;
        if (/\b(municipality|district municipality|administrative area|province)\b/.test(formattedAddress)) total -= 60;
        if (!hasComponent("street_number") && !hasComponent("route") && !hasSuburbLikeComponent && !hasCityLikeComponent) {
          total -= 35;
        }
        return total;
      };
      return score(right) - score(left);
    })[0];
  }
  function rankAddressAutocompletePredictions(input, predictions, lat, lng) {
    return [...predictions].sort(
      (left, right) => scoreMapsPrediction(right, input, lat, lng) - scoreMapsPrediction(left, input, lat, lng)
    );
  }
  function hasLocalityHint(query) {
    return SOUTH_AFRICAN_CITY_SUGGESTIONS.some(
      ([city]) => new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(query)
    );
  }
  function buildAddressSearchQueries(input, lat, lng) {
    const normalized = normalizeMapsQuery(input);
    const queries = /* @__PURE__ */ new Set();
    queries.add(normalized);
    const lower = normalized.toLowerCase();
    const startsWithNumber = /^\d+\s+/.test(lower);
    const bias = lat != null && lng != null ? { lat, lng } : SA_DEFAULT_BIAS;
    const nearPretoria = calculateHaversineDistanceKm(bias.lat, bias.lng, -25.7479, 28.2293) < 130;
    const looksPretoriaSpecific = /\bpretorius\b/i.test(normalized) || nearPretoria;
    if (!hasLocalityHint(normalized)) {
      if (looksPretoriaSpecific) {
        queries.add(`${normalized}, Pretoria, Gauteng`);
        if (!startsWithNumber) {
          queries.add(`${normalized}, Arcadia, Pretoria`);
          queries.add(`${normalized}, Pretoria Central`);
        }
      }
      queries.add(`${normalized}, South Africa`);
    }
    if (lower !== input.toLowerCase()) {
      queries.add(`${normalized}, South Africa`);
    }
    return Array.from(queries);
  }
  function buildExpandedAddressFallbackQueries(input) {
    const normalized = normalizeMapsQuery(input);
    const queries = /* @__PURE__ */ new Set();
    const hasStreetType = /\b(street|avenue|road|drive|lane|close|boulevard|crescent)\b/i.test(normalized);
    const numberOnlyMatch = normalized.match(/^(\d+)$/);
    if (numberOnlyMatch) {
      for (const suffix of ADDRESS_SEARCH_TYPE_HINTS) {
        queries.add(`${numberOnlyMatch[1]} ${suffix}`);
      }
      return Array.from(queries);
    }
    const shortStemMatch = normalized.match(/^(\d+)\s+([a-z]{3,5})$/i);
    if (shortStemMatch && !hasStreetType) {
      const [, leadingNumber, streetStem] = shortStemMatch;
      for (const suffix of ADDRESS_SEARCH_TYPE_HINTS) {
        queries.add(`${leadingNumber} ${streetStem} ${suffix}`);
      }
    }
    return Array.from(queries);
  }
  function scoreMapsPrediction(prediction, input, lat, lng) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const haystack = normalizeMapsQuery(`${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`).toLowerCase();
    const mainText = normalizeMapsQuery(prediction.mainText).toLowerCase();
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput);
    let score = 0;
    if (haystack.startsWith(normalizedInput)) score += 80;
    if (mainText.startsWith(normalizedInput)) score += 90;
    if (haystack.includes(normalizedInput)) score += 45;
    if (haystack.includes("south africa")) score += 8;
    if (haystack.includes("gauteng")) score += 8;
    if (haystack.includes("pretoria")) score += 18;
    if (normalizedInput.includes("pretorius") && haystack.includes("pretorius")) score += 30;
    if (/\bward\b/.test(haystack)) score -= 45;
    if (/\b(municipality|district municipality|administrative area)\b/.test(haystack)) score -= 35;
    if (leadingNumber && new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) score += 25;
    if (leadingNumber && !new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) score -= 30;
    for (const token of significantTokens) {
      if (new RegExp(`\\b${token}\\b`).test(haystack)) {
        score += 12;
      } else if (haystack.includes(token)) {
        score += 5;
      } else {
        score -= 10;
      }
    }
    if (prediction.lat != null && prediction.lng != null) {
      const bias = lat != null && lng != null ? { lat, lng } : SA_DEFAULT_BIAS;
      const distanceKm = calculateHaversineDistanceKm(bias.lat, bias.lng, prediction.lat, prediction.lng);
      score += Math.max(0, 35 - distanceKm / 4);
    }
    if (haystack.includes("cape town") && normalizedInput.includes("pretorius")) score -= 12;
    if (haystack.includes("buffalo city")) score -= 20;
    return score;
  }
  function filterAddressAutocompletePredictions(input, predictions, lat, lng) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const rankedPredictions = rankAddressAutocompletePredictions(input, predictions, lat, lng);
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput);
    const startsWithNumber = /^\d+\s+/.test(normalizedInput);
    if (significantTokens.length === 0 && !leadingNumber) return rankedPredictions;
    const minimumTokenMatches = significantTokens.length > 1 ? Math.min(significantTokens.length, 2) : significantTokens.length;
    const filteredPredictions = rankedPredictions.filter((prediction) => {
      const haystack = normalizeMapsQuery(`${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`).toLowerCase();
      if (/\b(ward|municipality|district municipality|administrative area)\b/.test(haystack)) {
        return false;
      }
      if (hasStackedPrimaryAddressNumbers(prediction)) {
        return false;
      }
      if (hasMismatchedPrimaryAddressNumber(prediction, leadingNumber)) {
        return false;
      }
      if (leadingNumber && !new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) {
        return false;
      }
      if (significantTokens.length === 0) {
        return true;
      }
      if (haystack.includes(normalizedInput)) {
        return true;
      }
      const tokenMatches = significantTokens.filter((token) => haystack.includes(token)).length;
      if (startsWithNumber) {
        return tokenMatches === significantTokens.length;
      }
      return tokenMatches >= minimumTokenMatches;
    });
    return filteredPredictions.length > 0 ? filteredPredictions : leadingNumber ? [] : rankedPredictions;
  }
  function dedupeAddressAutocompletePredictions(predictions) {
    const seen = /* @__PURE__ */ new Set();
    return predictions.filter((prediction) => {
      const normalizedMain = normalizeMapsQuery(prediction.mainText).toLowerCase();
      const normalizedSecondary = normalizeMapsQuery(prediction.secondaryText).toLowerCase();
      const normalizedDescription = normalizeMapsQuery(prediction.description).toLowerCase();
      const keys = [
        normalizedDescription,
        `${normalizedMain}|${normalizedSecondary}`,
        prediction.placeId
      ].filter(Boolean);
      if (keys.some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    });
  }
  function mapPhotonFeatureToPrediction(feature) {
    const properties = feature?.properties || {};
    const countryCode = String(properties.countrycode || "").toLowerCase();
    if (countryCode && countryCode !== "za") return null;
    const type = String(properties.type || "").toLowerCase();
    const houseNumber = String(properties.housenumber || "").trim();
    const street = String(properties.street || "").trim();
    const name = String(properties.name || "").trim();
    const addressLike = type === "street" || Boolean(street) || Boolean(houseNumber);
    if (!addressLike) return null;
    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
    const lng = typeof coordinates[0] === "number" ? coordinates[0] : null;
    const lat = typeof coordinates[1] === "number" ? coordinates[1] : null;
    const mainText = [houseNumber, street || name].filter(Boolean).join(" ").trim() || street || name;
    const secondaryParts = sanitizeAddressAutocompleteParts([
      properties.locality,
      properties.district,
      properties.city,
      properties.state
    ]);
    const secondaryText = secondaryParts.join(", ") || String(properties.country || "South Africa");
    const description = [mainText, secondaryText].filter(Boolean).join(", ") || name;
    if (!description) return null;
    const stableKey = [
      properties.osm_type || feature?.id || "feature",
      properties.osm_id || mainText || description
    ].filter(Boolean).join(":");
    return {
      placeId: `photon:${stableKey}`,
      description,
      mainText: mainText || description.split(",")[0] || "Pinned location",
      secondaryText,
      lat,
      lng
    };
  }
  async function photonCitySearch(query, limit = 8, options) {
    const normalizedQuery = normalizeMapsQuery(query);
    if (normalizedQuery.length < 2) return [];
    const hasBias = typeof options?.lat === "number" && Number.isFinite(options.lat) && typeof options?.lng === "number" && Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : SA_DEFAULT_BIAS.lat;
    const biasLng = hasBias ? Number(options?.lng) : SA_DEFAULT_BIAS.lng;
    const url = `${PHOTON_BASE_URL}/?q=${encodeURIComponent(normalizedQuery)}&limit=${Math.max(limit, 8)}&lang=en&lat=${biasLat}&lon=${biasLng}&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:municipality`;
    const response = await fetchMapsJsonSafely(url);
    const features = Array.isArray(response?.features) ? response.features : [];
    if (features.length === 0) return [];
    return dedupeAddressAutocompletePredictions(
      features.map(mapPhotonFeatureToPrediction).filter((p) => Boolean(p))
    ).map((prediction) => ({
      ...prediction,
      score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng)
    })).sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...prediction }) => prediction);
  }
  async function photonSearch(query, limit = 6, options) {
    const normalizedQuery = normalizeMapsQuery(query);
    const minQueryLength = Math.max(1, options?.minQueryLength ?? 2);
    if (normalizedQuery.length < minQueryLength) return [];
    const hasBias = typeof options?.lat === "number" && Number.isFinite(options.lat) && typeof options?.lng === "number" && Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : SA_DEFAULT_BIAS.lat;
    const biasLng = hasBias ? Number(options?.lng) : SA_DEFAULT_BIAS.lng;
    const searchQueries = buildAddressSearchQueries(normalizedQuery, options?.lat, options?.lng);
    const rawFeatures = [];
    for (const searchQuery of searchQueries) {
      const url = `${PHOTON_BASE_URL}/?q=${encodeURIComponent(searchQuery)}&limit=${Math.max(limit, 8)}&lang=en&lat=${biasLat}&lon=${biasLng}`;
      const response = await fetchMapsJsonSafely(url);
      const features = Array.isArray(response?.features) ? response.features : [];
      rawFeatures.push(...features);
      if (rawFeatures.length >= limit * 3) break;
    }
    if (rawFeatures.length === 0) return [];
    const searchTokens = extractAddressTokens(normalizedQuery.replace(/^\d+\s*/, ""));
    return dedupeAddressAutocompletePredictions(
      rawFeatures.map(mapPhotonFeatureToPrediction).filter((prediction) => Boolean(prediction)).filter((prediction) => {
        if (searchTokens.length === 0) return true;
        const primaryText = normalizeMapsQuery(`${prediction.mainText} ${prediction.description.split(",")[0] || ""}`).toLowerCase();
        return searchTokens.some((token) => primaryText.includes(token));
      })
    ).map((prediction) => ({
      ...prediction,
      score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng)
    })).sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...prediction }) => prediction);
  }
  async function fetchNumberedStreetAutocompletePredictions(input, limit = 5, options) {
    const normalizedInput = normalizeMapsQuery(input);
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    if (!leadingNumber) return [];
    const streetFragment = normalizedInput.replace(/^\d+\s*/, "").trim();
    const prefixTokens = extractAddressTokens(streetFragment, 1);
    const significantTokens = extractAddressTokens(streetFragment, 3);
    const usePrefixMatching = significantTokens.length === 0 && prefixTokens.length > 0;
    const activeTokens = usePrefixMatching ? prefixTokens : significantTokens;
    const longestTokenLength = prefixTokens.reduce((longest, token) => Math.max(longest, token.length), 0);
    const hasStreetType = /\b(street|avenue|road|drive|lane|close|boulevard|crescent)\b/i.test(streetFragment);
    if (!streetFragment || activeTokens.length === 0) {
      return [];
    }
    const providerLimit = usePrefixMatching && !hasStreetType ? Math.max(limit * 6, 30) : limit * 2;
    const useNominatim = !usePrefixMatching || hasStreetType;
    const [photonPredictions, nominatimPredictions] = await Promise.all([
      photonSearch(streetFragment, providerLimit, { ...options, minQueryLength: 1 }),
      useNominatim ? nominatimSearch(streetFragment, providerLimit, options) : Promise.resolve([])
    ]);
    const syntheticPredictions = dedupeAddressAutocompletePredictions([
      ...photonPredictions,
      ...nominatimPredictions
    ]).map((prediction) => {
      if (hasStackedPrimaryAddressNumbers(prediction)) return null;
      if (hasMismatchedPrimaryAddressNumber(prediction, leadingNumber)) return null;
      if (usePrefixMatching) {
        if (!predictionMatchesAddressPrefixes(prediction, activeTokens)) return null;
      } else {
        const primaryText = normalizeMapsQuery(`${prediction.mainText} ${prediction.description.split(",")[0] || ""}`).toLowerCase();
        if (!activeTokens.some((token) => primaryText.includes(token))) return null;
      }
      const existingNumber = getLeadingAddressNumber(prediction.mainText);
      const streetText = existingNumber === leadingNumber ? stripLeadingAddressNumber(prediction.mainText) : prediction.mainText;
      const mainText = existingNumber === leadingNumber ? prediction.mainText : `${leadingNumber} ${streetText}`.replace(/\s+/g, " ").trim();
      return {
        placeId: `synthetic:${leadingNumber}:${prediction.placeId}`,
        description: [mainText, prediction.secondaryText].filter(Boolean).join(", "),
        mainText,
        secondaryText: prediction.secondaryText,
        lat: prediction.lat,
        lng: prediction.lng
      };
    }).filter((prediction) => Boolean(prediction));
    return rankAddressAutocompletePredictions(normalizedInput, syntheticPredictions, options?.lat, options?.lng).slice(0, limit);
  }
  async function searchExpandedAddressFallbackQueries(input, limit = 6, options) {
    const expandedQueries = buildExpandedAddressFallbackQueries(input);
    if (expandedQueries.length === 0) return [];
    const batches = await Promise.all(
      expandedQueries.flatMap((expandedQuery) => [
        photonSearch(expandedQuery, Math.max(limit, 6), { ...options, minQueryLength: 1 }),
        nominatimSearch(expandedQuery, Math.max(limit, 6), options)
      ])
    );
    return rankAddressAutocompletePredictions(
      input,
      dedupeAddressAutocompletePredictions(batches.flat()),
      options?.lat,
      options?.lng
    ).slice(0, limit);
  }
  function mapGoogleGeocodeResultToPrediction(result) {
    const components = Array.isArray(result?.address_components) ? result.address_components : [];
    const get = (type) => components.find((component) => component?.types?.includes(type))?.long_name || "";
    const streetNumber = get("street_number");
    const route = get("route");
    const suburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood");
    const city = get("locality") || get("administrative_area_level_2");
    const province = get("administrative_area_level_1");
    const mainText = route ? `${streetNumber ? `${streetNumber} ` : ""}${route}` : result.formatted_address.split(",")[0];
    const secondaryParts = sanitizeAddressAutocompleteParts([suburb, city, province]);
    return {
      placeId: result.place_id,
      description: [mainText, ...secondaryParts].join(", ") || result.formatted_address,
      mainText,
      secondaryText: secondaryParts.join(", "),
      lat: result.geometry?.location?.lat ?? null,
      lng: result.geometry?.location?.lng ?? null
    };
  }
  function shouldSupplementAddressAutocompleteWithGeocode(input, predictions) {
    const normalizedInput = normalizeMapsQuery(input).toLowerCase();
    const leadingNumber = normalizedInput.match(/^\d+/)?.[0] || "";
    const significantTokens = extractAddressTokens(normalizedInput, /^\d+\s+/.test(normalizedInput) ? 2 : 3);
    const longestTokenLength = significantTokens.reduce((longest, token) => Math.max(longest, token.length), 0);
    if (!leadingNumber || longestTokenLength < 4) return false;
    return !predictions.some((prediction) => {
      const haystack = normalizeMapsQuery(
        `${prediction.description} ${prediction.mainText} ${prediction.secondaryText}`
      ).toLowerCase();
      if (!new RegExp(`(^|\\D)${leadingNumber}(\\D|$)`).test(haystack)) {
        return false;
      }
      if (haystack.includes(normalizedInput)) {
        return true;
      }
      const tokenMatches = significantTokens.filter((token) => haystack.includes(token)).length;
      return tokenMatches >= significantTokens.length;
    });
  }
  function mapGoogleAutocompleteNewSuggestionToPrediction(suggestion) {
    const placePrediction = suggestion?.placePrediction;
    if (!placePrediction?.placeId) {
      const queryText = String(suggestion?.queryPrediction?.text?.text || "").trim();
      if (!queryText) return null;
      const [mainText2, ...secondaryParts] = queryText.split(",").map((part) => part.trim()).filter(Boolean);
      return {
        placeId: `query:${encodeURIComponent(queryText)}`,
        description: queryText,
        mainText: mainText2 || queryText,
        secondaryText: secondaryParts.join(", "),
        lat: null,
        lng: null
      };
    }
    const description = String(placePrediction.text?.text || "").trim();
    const mainText = String(
      placePrediction.structuredFormat?.mainText?.text || description.split(",")[0] || ""
    ).trim();
    const secondaryText = String(
      placePrediction.structuredFormat?.secondaryText?.text || description.split(",").slice(1).join(", ").trim() || ""
    ).trim();
    return {
      placeId: placePrediction.placeId,
      description: description || [mainText, secondaryText].filter(Boolean).join(", "),
      mainText: mainText || description.split(",")[0] || "Pinned location",
      secondaryText,
      lat: null,
      lng: null
    };
  }
  async function fetchGoogleAutocompleteNewPredictions(options) {
    const bias = options.hasLocationBias && options.lat !== null && options.lng !== null ? { lat: options.lat, lng: options.lng } : SA_DEFAULT_BIAS;
    const requestedRadius = options.hasLocationBias ? options.cityOnly ? 22e4 : 9e4 : options.cityOnly ? 45e4 : 16e4;
    const radius = Math.min(requestedRadius, 5e4);
    const body = {
      input: options.input,
      includedRegionCodes: ["za"],
      inputOffset: Array.from(options.input).length,
      languageCode: "en",
      regionCode: "za",
      includeQueryPredictions: !options.cityOnly,
      locationBias: {
        circle: {
          center: {
            latitude: bias.lat,
            longitude: bias.lng
          },
          radius
        }
      }
    };
    if (options.cityOnly) {
      body.includedPrimaryTypes = ["(cities)"];
    }
    if (options.sessionToken) {
      body.sessionToken = options.sessionToken;
    }
    const response = await fetchMapsJsonPostSafely(
      "https://places.googleapis.com/v1/places:autocomplete",
      body,
      {
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": GOOGLE_AUTOCOMPLETE_FIELD_MASK
      }
    );
    const predictions = Array.isArray(response?.suggestions) ? response.suggestions.map(mapGoogleAutocompleteNewSuggestionToPrediction).filter((prediction) => Boolean(prediction)) : [];
    return {
      predictions,
      status: predictions.length > 0 ? "OK" : response?.error?.status || "ZERO_RESULTS",
      errorMessage: response?.error?.message || ""
    };
  }
  async function fetchGoogleAutocompleteLegacyPredictions(options) {
    const tokenQuery = options.sessionToken ? `&sessiontoken=${encodeURIComponent(options.sessionToken)}` : "";
    const typeQuery = options.cityOnly ? "&types=(cities)" : "";
    const zaBiasQuery = options.hasLocationBias ? `&location=${options.lat},${options.lng}&radius=${options.cityOnly ? 22e4 : 9e4}` : `&location=${SA_DEFAULT_BIAS.lat},${SA_DEFAULT_BIAS.lng}&radius=${options.cityOnly ? 45e4 : 16e4}`;
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(options.input)}&components=country:za&region=za&language=en${typeQuery}${zaBiasQuery}${tokenQuery}&key=${GOOGLE_KEY}`;
    const response = await fetchMapsJson(url);
    const predictions = Array.isArray(response?.predictions) ? response.predictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description.split(",")[0],
      secondaryText: p.structured_formatting?.secondary_text || "",
      lat: null,
      lng: null
    })) : [];
    return {
      predictions,
      status: response?.status || (predictions.length > 0 ? "OK" : "ZERO_RESULTS"),
      errorMessage: response?.error_message || ""
    };
  }
  async function fetchGooglePlaceDetailsNew(placeId, sessionToken) {
    const placeName = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
    const encodedPlaceName = placeName.split("/").map(encodeURIComponent).join("/");
    const params = new URLSearchParams({
      languageCode: "en",
      regionCode: "za"
    });
    if (sessionToken) params.set("sessionToken", sessionToken);
    const response = await fetch(`https://places.googleapis.com/v1/${encodedPlaceName}?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-ZA,en;q=0.9",
        "User-Agent": MAPS_USER_AGENT,
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK
      }
    });
    const rawBody = await response.text();
    if (!rawBody) return null;
    let result;
    try {
      result = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const latitude = result?.location?.latitude;
    const longitude = result?.location?.longitude;
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      if (result?.error?.status) {
        console.warn("[maps] Google place details new fallback engaged:", result.error.status);
      }
      return null;
    }
    return {
      lat: latitude,
      lng: longitude,
      address: result.formattedAddress || result.displayName?.text || null
    };
  }
  async function fetchGeocodeAutocompletePredictions(input, limit = 5, options) {
    if (!GOOGLE_KEY) return [];
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${input}, South Africa`)}&components=country:ZA&region=za&key=${GOOGLE_KEY}`;
    const geocodeResponse = await fetchMapsJsonSafely(geocodeUrl);
    if (geocodeResponse?.status !== "OK" || !Array.isArray(geocodeResponse.results) || geocodeResponse.results.length === 0) {
      return [];
    }
    const geocodeResults = options?.cityOnly ? geocodeResponse.results.filter((result) => {
      const types = Array.isArray(result?.types) ? result.types : [];
      return types.includes("locality") || types.includes("postal_town") || types.includes("administrative_area_level_2");
    }) : geocodeResponse.results;
    return geocodeResults.slice(0, Math.max(limit, 5)).map(mapGoogleGeocodeResultToPrediction);
  }
  function southAfricanCityFallback(input, lat, lng) {
    const query = normalizeMapsQuery(input).toLowerCase();
    if (query.length < 2) return [];
    const bias = lat != null && lng != null ? { lat, lng } : null;
    return SOUTH_AFRICAN_CITY_SUGGESTIONS.map(([city, province, cityLat, cityLng]) => {
      const cityLower = city.toLowerCase();
      const starts = cityLower.startsWith(query);
      const includes = cityLower.includes(query);
      if (!starts && !includes) return null;
      const distanceBoost = bias ? Math.max(0, 10 - calculateHaversineDistanceKm(bias.lat, bias.lng, cityLat, cityLng) / 80) : 0;
      return {
        placeId: `sa-city:${cityLower.replace(/\s+/g, "-")}`,
        description: `${city}, ${province}, South Africa`,
        mainText: city,
        secondaryText: `${province}, South Africa`,
        lat: cityLat,
        lng: cityLng,
        score: (starts ? 50 : 25) + distanceBoost
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT).map(({ score: _score, ...prediction }) => prediction);
  }
  async function nominatimSearch(query, limit = 6, options) {
    const normalizedQuery = normalizeMapsQuery(query);
    const cityOnly = options?.cityOnly ?? false;
    const hasBias = typeof options?.lat === "number" && Number.isFinite(options.lat) && typeof options?.lng === "number" && Number.isFinite(options.lng);
    const biasLat = hasBias ? Number(options?.lat) : null;
    const biasLng = hasBias ? Number(options?.lng) : null;
    const searchQueries = cityOnly ? [normalizedQuery] : buildAddressSearchQueries(normalizedQuery, options?.lat, options?.lng);
    const allRawResults = [];
    for (const searchQuery of searchQueries) {
      const biasQuery = hasBias ? `&viewbox=${biasLng - 1.6},${biasLat + 1.6},${biasLng + 1.6},${biasLat - 1.6}&bounded=0` : "";
      const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&addressdetails=1&limit=${Math.max(limit, 8)}&countrycodes=za${biasQuery}&q=${encodeURIComponent(searchQuery)}`;
      const rawResults = await fetchMapsJsonSafely(url);
      if (Array.isArray(rawResults)) allRawResults.push(...rawResults);
      if (allRawResults.length >= limit * 3) break;
    }
    if (allRawResults.length === 0) return [];
    const seen = /* @__PURE__ */ new Set();
    const results = (cityOnly ? allRawResults.filter((result) => isCityLikeNominatimResult(result)) : allRawResults).filter((result) => {
      const key = `${result.place_id || ""}:${result.lat || ""}:${result.lon || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return results.map((result) => {
      const formatted = formatNominatimAddress(result.address, result.display_name);
      const prediction = {
        placeId: `nominatim:${result.place_id}`,
        description: formatted.description || result.display_name,
        mainText: formatted.mainText,
        secondaryText: formatted.secondaryText,
        lat: result.lat ? Number(result.lat) : null,
        lng: result.lon ? Number(result.lon) : null
      };
      return {
        ...prediction,
        score: scoreMapsPrediction(prediction, normalizedQuery, options?.lat, options?.lng)
      };
    }).sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _score, ...prediction }) => prediction);
  }
  async function nominatimReverse(lat, lng) {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=18`;
    const result = await fetchMapsJsonSafely(url);
    if (!result || !result.address) return null;
    const formatted = formatNominatimAddress(result.address, result.display_name);
    return {
      placeId: `nominatim:${result.place_id || `${lat},${lng}`}`,
      description: formatted.description || result.display_name,
      mainText: formatted.mainText,
      secondaryText: formatted.secondaryText,
      lat: parseFloat(String(lat)),
      lng: parseFloat(String(lng))
    };
  }
  app2.get("/api/geocode", async (req, res) => {
    try {
      const address = req.query.address;
      if (!address) return res.status(400).json({ message: "Address is required" });
      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:ZA&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJsonSafely(url);
        if (r.status === "OK" && r.results.length > 0) {
          const loc = r.results[0].geometry.location;
          return res.json({ lat: loc.lat, lng: loc.lng });
        }
        console.warn("[maps] Google geocode fallback engaged:", r.status || "unknown");
      }
      const osmResults = await nominatimSearch(address, 1);
      if (osmResults.length > 0 && osmResults[0].lat != null && osmResults[0].lng != null) {
        return res.json({ lat: osmResults[0].lat, lng: osmResults[0].lng });
      }
      return res.status(404).json({ message: "Location not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/autocomplete", async (req, res) => {
    try {
      const input = req.query.input;
      const lat = isValidCoordinate(req.query.lat) ? Number(req.query.lat) : null;
      const lng = isValidCoordinate(req.query.lng) ? Number(req.query.lng) : null;
      const hasLocationBias = lat !== null && lng !== null;
      const cityOnly = ["1", "true", "yes", "city", "cities"].includes(
        String(req.query.cityOnly || req.query.mode || "").toLowerCase()
      );
      const sessionToken = typeof req.query.sessionToken === "string" ? req.query.sessionToken : typeof req.query.sessiontoken === "string" ? req.query.sessiontoken : "";
      if (!input || input.trim().length < 2) return res.json({ predictions: [] });
      const normalizedInput = normalizeMapsQuery(input);
      const staticCityPredictions = cityOnly ? southAfricanCityFallback(normalizedInput, lat, lng) : [];
      const providerDebug = {
        googleConfigured: Boolean(GOOGLE_KEY)
      };
      if (GOOGLE_KEY) {
        let googleResult = await fetchGoogleAutocompleteNewPredictions({
          input: normalizedInput,
          cityOnly,
          hasLocationBias,
          lat,
          lng,
          sessionToken
        });
        providerDebug.googleNewStatus = googleResult.status;
        providerDebug.googleNewCount = googleResult.predictions.length;
        if (googleResult.errorMessage) providerDebug.googleNewError = googleResult.errorMessage;
        if (googleResult.predictions.length === 0 && googleResult.status !== "OK") {
          googleResult = await fetchGoogleAutocompleteLegacyPredictions({
            input: normalizedInput,
            cityOnly,
            hasLocationBias,
            lat,
            lng,
            sessionToken
          });
          providerDebug.googleLegacyStatus = googleResult.status;
          providerDebug.googleLegacyCount = googleResult.predictions.length;
          if (googleResult.errorMessage) providerDebug.googleLegacyError = googleResult.errorMessage;
        }
        const mappedPredictions = googleResult.predictions;
        const geocodePredictions = !cityOnly && shouldSupplementAddressAutocompleteWithGeocode(normalizedInput, mappedPredictions) ? await fetchGeocodeAutocompletePredictions(normalizedInput, 5) : [];
        providerDebug.googleMappedCount = mappedPredictions.length;
        providerDebug.googleGeocodeSupplementCount = geocodePredictions.length;
        const mergedPredictions = cityOnly ? mappedPredictions : dedupeAddressAutocompletePredictions([...geocodePredictions, ...mappedPredictions]);
        const filteredPredictions = cityOnly ? mappedPredictions : filterAddressAutocompletePredictions(normalizedInput, mergedPredictions, lat, lng);
        providerDebug.googleFilteredCount = filteredPredictions.length;
        if (cityOnly && (staticCityPredictions.length > 0 || mappedPredictions.length > 0)) {
          return res.json({
            predictions: [...staticCityPredictions, ...mappedPredictions].slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug
          });
        }
        if (filteredPredictions.length > 0) {
          return res.json({
            predictions: filteredPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug
          });
        }
        if (normalizedInput.trim().length >= 3) {
          const geocodePredictions2 = await fetchGeocodeAutocompletePredictions(normalizedInput, 5, { cityOnly });
          providerDebug.googleGeocodeFallbackCount = geocodePredictions2.length;
          if (geocodePredictions2.length > 0) {
            const filteredGeocodePredictions = cityOnly ? geocodePredictions2 : filterAddressAutocompletePredictions(normalizedInput, geocodePredictions2, lat, lng);
            providerDebug.googleGeocodeFallbackFilteredCount = filteredGeocodePredictions.length;
            if (filteredGeocodePredictions.length === 0) {
              console.warn("[maps] Google geocode autocomplete fallback had no token-matching predictions");
            } else {
              return res.json({
                predictions: filteredGeocodePredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
                debug: providerDebug
              });
            }
          }
        }
        if (googleResult.status !== "ZERO_RESULTS") {
          console.warn("[maps] Google autocomplete fallback engaged:", googleResult.status || "unknown");
        }
      }
      if (!cityOnly) {
        const [photonPredictions, numberedStreetPredictions] = await Promise.all([
          photonSearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng }),
          fetchNumberedStreetAutocompletePredictions(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng })
        ]);
        const providerPredictions = filterAddressAutocompletePredictions(
          normalizedInput,
          dedupeAddressAutocompletePredictions([...numberedStreetPredictions, ...photonPredictions]),
          lat,
          lng
        );
        providerDebug.photonCount = photonPredictions.length;
        providerDebug.numberedStreetCount = numberedStreetPredictions.length;
        providerDebug.providerFilteredCount = providerPredictions.length;
        if (providerPredictions.length > 0) {
          return res.json({
            predictions: providerPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug
          });
        }
        const expandedRawPredictions = await searchExpandedAddressFallbackQueries(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng });
        const expandedProviderPredictions = filterAddressAutocompletePredictions(
          normalizedInput,
          expandedRawPredictions,
          lat,
          lng
        );
        providerDebug.expandedProviderCount = expandedRawPredictions.length;
        providerDebug.expandedProviderFilteredCount = expandedProviderPredictions.length;
        if (expandedProviderPredictions.length > 0) {
          return res.json({
            predictions: expandedProviderPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
            debug: providerDebug
          });
        }
      }
      const [osmPredictions, photonCityPredictions] = await Promise.all([
        nominatimSearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { cityOnly, lat, lng }),
        cityOnly ? photonCitySearch(normalizedInput, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT, { lat, lng }) : Promise.resolve([])
      ]);
      providerDebug.osmCount = osmPredictions.length;
      providerDebug.photonCityCount = photonCityPredictions.length;
      const filteredOsmPredictions = cityOnly ? osmPredictions : filterAddressAutocompletePredictions(normalizedInput, osmPredictions, lat, lng);
      providerDebug.osmFilteredCount = filteredOsmPredictions.length;
      if (cityOnly) {
        const seenCities = /* @__PURE__ */ new Set();
        const cityPredictions = [...staticCityPredictions, ...photonCityPredictions, ...osmPredictions].filter((prediction) => {
          const key = String(prediction.mainText || prediction.description || "").toLowerCase();
          if (!key || seenCities.has(key)) return false;
          seenCities.add(key);
          return true;
        });
        return res.json({
          predictions: cityPredictions.slice(0, ADDRESS_AUTOCOMPLETE_RESULT_LIMIT),
          debug: providerDebug
        });
      }
      return res.json({
        predictions: filteredOsmPredictions,
        debug: providerDebug
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/details", async (req, res) => {
    try {
      const placeId = req.query.placeId;
      const description = typeof req.query.description === "string" ? req.query.description.trim() : "";
      const sessionToken = typeof req.query.sessionToken === "string" ? req.query.sessionToken : typeof req.query.sessiontoken === "string" ? req.query.sessiontoken : "";
      if (!placeId) return res.status(400).json({ message: "placeId is required" });
      const isGooglePlaceId = !/^(nominatim|photon|sa-city|manual|synthetic|query):/i.test(placeId);
      if (!isGooglePlaceId && description) {
        const fallbackPredictions = await nominatimSearch(description, 1);
        const bestMatch = fallbackPredictions.find((prediction) => prediction.lat != null && prediction.lng != null);
        if (bestMatch && bestMatch.lat != null && bestMatch.lng != null) {
          return res.json({
            lat: bestMatch.lat,
            lng: bestMatch.lng,
            address: bestMatch.description
          });
        }
      }
      if (!GOOGLE_KEY) return res.status(500).json({ message: "Google Maps API key not configured" });
      const newDetails = await fetchGooglePlaceDetailsNew(placeId, sessionToken);
      if (newDetails) {
        return res.json(newDetails);
      }
      const tokenQuery = sessionToken ? `&sessiontoken=${encodeURIComponent(sessionToken)}` : "";
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,name${tokenQuery}&key=${GOOGLE_KEY}`;
      const r = await (await fetch(url)).json();
      if (r.status === "OK") {
        const loc = r.result.geometry.location;
        return res.json({ lat: loc.lat, lng: loc.lng, address: r.result.formatted_address });
      }
      return res.status(404).json({ message: "Place not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/places/reverse", async (req, res) => {
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) return res.status(400).json({ message: "lat and lng are required" });
      if (GOOGLE_KEY) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}`;
        const r = await fetchMapsJson(url);
        if (r.status === "OK" && r.results.length > 0) {
          const best = chooseBestReverseGeocodeResult(r.results) || r.results[0];
          const components = best.address_components;
          const get = (type) => components.find((c) => c.types.includes(type))?.long_name || "";
          const streetNumber = get("street_number");
          const route = get("route");
          const suburb = get("sublocality_level_1") || get("sublocality") || get("neighborhood");
          const city = get("locality") || get("administrative_area_level_2");
          const province = get("administrative_area_level_1");
          const mainText = route ? `${streetNumber ? streetNumber + " " : ""}${route}` : best.formatted_address.split(",")[0];
          const secondaryParts = [suburb, city, province].filter(Boolean);
          const composedDescription = [mainText, ...secondaryParts].filter((part, index, parts) => Boolean(part) && parts.indexOf(part) === index).join(", ");
          return res.json({
            placeId: best.place_id,
            description: composedDescription || best.formatted_address,
            mainText,
            secondaryText: secondaryParts.join(", "),
            lat: parseFloat(lat),
            lng: parseFloat(lng)
          });
        }
        console.warn("[maps] Google reverse geocode fallback engaged:", r.status || "unknown");
      }
      const osmResult = await nominatimReverse(lat, lng);
      if (osmResult) return res.json(osmResult);
      return res.status(404).json({ message: "Location not found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/directions", async (req, res) => {
    try {
      const originLat = typeof req.query.originLat === "string" ? req.query.originLat : "";
      const originLng = typeof req.query.originLng === "string" ? req.query.originLng : "";
      const destLat = typeof req.query.destLat === "string" ? req.query.destLat : "";
      const destLng = typeof req.query.destLng === "string" ? req.query.destLng : "";
      if (!originLat || !originLng || !destLat || !destLng) {
        return res.status(400).json({ message: "Origin and destination coordinates are required" });
      }
      const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Google Maps API key not configured" });
      }
      const cacheKey = buildDirectionsCacheKey(originLat, originLng, destLat, destLng);
      if (cacheKey) {
        const cached = getDirectionsCacheEntry(cacheKey);
        if (cached) {
          return res.json(cached);
        }
      }
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&alternatives=true&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === "OK" && data.routes?.length > 0) {
        const parseRoute = (route, idx) => {
          const leg = route.legs[0];
          const steps = (leg.steps || []).map((step) => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
            distance: step.distance?.text || "",
            duration: step.duration?.text || "",
            endLat: step.end_location?.lat,
            endLng: step.end_location?.lng,
            maneuver: step.maneuver || "straight"
          }));
          return {
            polyline: route.overview_polyline.points,
            distanceKm: leg.distance.value / 1e3,
            distanceText: leg.distance.text,
            durationMin: Math.ceil(leg.duration.value / 60),
            durationText: leg.duration.text,
            summary: route.summary || `Route ${idx + 1}`,
            steps
          };
        };
        const primary = parseRoute(data.routes[0], 0);
        const alternatives = data.routes.map((r, i) => parseRoute(r, i));
        const payload = { ...primary, alternatives };
        if (cacheKey) {
          setDirectionsCacheEntry(cacheKey, payload);
        }
        return res.json(payload);
      }
      return res.status(404).json({ message: "No route found" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const allUsers = await db2.select().from(users).orderBy((0, import_drizzle_orm4.desc)(users.createdAt));
      const enrichedUsers = await Promise.all(allUsers.map(async (user) => {
        const { password: _password, ...safeUser } = user;
        const membership = await storage.getLiftClubMembershipByUser(user.id).catch(() => void 0);
        return {
          ...safeUser,
          liftClubMembership: membership ? {
            id: membership.id,
            status: membership.status,
            feeAmount: membership.feeAmount,
            rejectionReason: membership.rejectionReason,
            isApproved: membership.status === "approved"
          } : null
        };
      }));
      return res.json(enrichedUsers);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, req.body);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/selfie", requireAuth, async (req, res) => {
    try {
      const { profilePhoto } = req.body;
      if (typeof profilePhoto !== "string" || !profilePhoto.trim()) {
        return res.status(400).json({ message: "profilePhoto URL is required" });
      }
      if (req.auth.sub !== req.params.id) return res.status(403).json({ message: "Forbidden" });
      const user = await storage.updateUser(req.params.id, { profilePhoto: profilePhoto.trim() });
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/push-token", requireAuth, async (req, res) => {
    try {
      if (req.auth.sub !== req.params.id) {
        const caller = await storage.getUser(req.auth.sub);
        if (caller?.role !== "admin") {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const { pushToken } = req.body;
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ message: "pushToken is required" });
      }
      if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      const updatedUser = await storage.updateUser(req.params.id, { pushToken });
      if (!updatedUser) return res.status(404).json({ message: "User not found" });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/users/:id/role", async (req, res) => {
    try {
      const { role } = req.body;
      const user = await storage.updateUser(req.params.id, { role });
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password: _pw, ...safeUser } = user;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:id/topup", async (req, res) => {
    try {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const newBalance = (user.walletBalance || 0) + amount;
      const updated = await storage.updateUser(req.params.id, {
        walletBalance: newBalance
      });
      if (!updated) return res.status(500).json({ message: "Failed to update balance" });
      await storage.createNotification({
        userId: req.params.id,
        title: "Wallet Top Up",
        body: `R ${amount.toFixed(2)} has been added to your wallet. New balance: R ${newBalance.toFixed(2)}`,
        type: "wallet"
      });
      const { password: _pw, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/version", (_req, res) => {
    res.json({
      version: "google-oauth-v2",
      built: (/* @__PURE__ */ new Date()).toISOString(),
      commit: getReleaseFingerprint()
    });
  });
  app2.get("/api/auth/google/start", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).send("Google OAuth not configured");
    const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;
    const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
    const platform = req.query.platform === "web" && isAllowedGoogleWebRedirect(redirect) ? "web" : "app";
    const state = encodeGoogleAuthState(platform === "web" ? { platform, redirect } : { platform: "app" });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  });
  app2.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, error, state } = req.query;
      const authState = decodeGoogleAuthState(typeof state === "string" ? state : void 0);
      const isWeb = authState.platform === "web" && isAllowedGoogleWebRedirect(authState.redirect);
      if (error || !code) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: String(error || "cancelled") }));
        }
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(error || "cancelled")}`);
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const callbackUrl = `https://api-production-0783.up.railway.app/api/auth/google/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl, grant_type: "authorization_code" }).toString()
      });
      const tokens = await tokenRes.json();
      if (tokens.error) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: String(tokens.error_description || tokens.error) }));
        }
        return res.redirect(`a2blift://auth?error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        if (isWeb) {
          return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: "no_email" }));
        }
        return res.redirect(`a2blift://auth?error=no_email`);
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({ username: email, password: randomPassword, name: googleUser.name || email.split("@")[0], phone: null, role: "client" });
      }
      const appToken = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      const { password: _pw, ...safeUser } = user;
      if (isWeb) {
        return res.redirect(buildGoogleWebRedirect(authState.redirect, {
          accessToken: appToken,
          user: JSON.stringify(safeUser)
        }));
      }
      const payload = encodeURIComponent(JSON.stringify({ user: safeUser, accessToken: appToken }));
      return res.redirect(`a2blift://auth?payload=${payload}`);
    } catch (err) {
      const authState = decodeGoogleAuthState(typeof req.query.state === "string" ? req.query.state : void 0);
      if (authState.platform === "web" && isAllowedGoogleWebRedirect(authState.redirect)) {
        return res.redirect(buildGoogleWebRedirect(authState.redirect, { error: err.message || "oauth_failed" }));
      }
      return res.redirect(`a2blift://auth?error=${encodeURIComponent(err.message)}`);
    }
  });
  app2.post("/api/auth/google", async (req, res) => {
    try {
      const { code, redirectUri } = req.body;
      if (!code || !redirectUri) {
        return res.status(400).json({ message: "code and redirectUri are required" });
      }
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables." });
      }
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        }).toString()
      });
      const tokens = await tokenRes.json();
      if (tokens.error) {
        return res.status(400).json({ message: `Google token error: ${tokens.error_description || tokens.error}` });
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client"
        });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      console.error("Google OAuth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });
  app2.post("/api/auth/google-token", async (req, res) => {
    try {
      const { accessToken } = req.body;
      if (!accessToken) {
        return res.status(400).json({ message: "accessToken is required" });
      }
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const googleUser = await userInfoRes.json();
      if (!googleUser.email) {
        return res.status(400).json({ message: "Could not retrieve email from Google" });
      }
      const email = googleUser.email.trim().toLowerCase();
      let user = await storage.getUserByUsername(email);
      if (!user) {
        const randomPassword = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
        user = await storage.createUser({
          username: email,
          password: randomPassword,
          name: googleUser.name || email.split("@")[0],
          phone: null,
          role: "client"
        });
      }
      const token = signAccessToken({ sub: user.id, role: user.role, email: user.username, name: user.name });
      setAuthCookie(res, token);
      const { password: _pw, ...safeUser } = user;
      return res.json({ user: safeUser, accessToken: token });
    } catch (error) {
      console.error("Google token auth error:", error);
      return res.status(500).json({ message: error.message || "Google authentication failed" });
    }
  });
  app2.post("/api/chauffeurs", authOptional, async (req, res) => {
    try {
      const userId = req.body.userId;
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const rawVehicleYear = req.body.vehicleYear;
      if (req.auth && req.auth.role !== "admin" && req.auth.sub !== userId) {
        return res.status(403).json({ message: "You can only register your own chauffeur profile" });
      }
      if (userId) {
        const existingUser = await storage.getUser(userId);
        if (!existingUser) {
          const randomPw = Math.random().toString(36).slice(2);
          await storage.createUser({
            id: userId,
            username: `driver_${userId.slice(0, 12)}@a2blift.placeholder`,
            password: randomPw,
            name: req.body.name || "A2B Driver",
            phone: req.body.phone || null,
            role: "chauffeur"
          });
        }
      }
      if (!userId) return res.status(400).json({ message: "userId is required" });
      let chauffeur;
      const existingChauffeur = await storage.getChauffeurByUserId(userId);
      const normalizedVehicleYear = rawVehicleYear == null || rawVehicleYear === "" ? existingChauffeur?.vehicleYear ?? null : Number.parseInt(String(rawVehicleYear), 10);
      if (!Number.isFinite(normalizedVehicleYear) || normalizedVehicleYear == null) {
        return res.status(400).json({ message: "Please add your vehicle model year before continuing." });
      }
      if (normalizedVehicleYear < 2015 || normalizedVehicleYear > currentYear + 1) {
        return res.status(400).json({ message: `Please enter a vehicle model year between 2015 and ${currentYear + 1}.` });
      }
      if (existingChauffeur) {
        chauffeur = await storage.updateChauffeur(existingChauffeur.id, {
          carMake: req.body.carMake || existingChauffeur.carMake,
          vehicleModel: req.body.vehicleModel || existingChauffeur.vehicleModel,
          vehicleYear: normalizedVehicleYear,
          plateNumber: req.body.plateNumber || existingChauffeur.plateNumber,
          vehicleType: req.body.vehicleType || existingChauffeur.vehicleType,
          carColor: req.body.carColor || existingChauffeur.carColor,
          phone: req.body.phone || existingChauffeur.phone,
          passengerCapacity: req.body.passengerCapacity || existingChauffeur.passengerCapacity,
          luggageCapacity: req.body.luggageCapacity || existingChauffeur.luggageCapacity,
          profilePhoto: req.body.profilePhoto || existingChauffeur.profilePhoto
        });
      } else {
        chauffeur = await storage.createChauffeur({
          ...req.body,
          vehicleYear: normalizedVehicleYear
        });
      }
      await storage.updateUser(req.body.userId, { role: "chauffeur" });
      const existingApp = await storage.getDriverApplicationByUserId(req.body.userId);
      if (!existingApp) {
        await storage.createDriverApplication({
          userId: req.body.userId,
          chauffeurId: chauffeur.id,
          status: "pending"
        });
      } else if (existingApp.chauffeurId !== chauffeur.id) {
        await storage.updateDriverApplication(existingApp.id, { chauffeurId: chauffeur.id });
      }
      return res.json(chauffeur);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  const PARTNER_REQUIRED_DOCS = /* @__PURE__ */ new Set([
    "partner:company_registration",
    "partner:director_id",
    "partner:proof_of_address",
    "partner:operating_permit",
    "partner:bank_account_details"
  ]);
  const VEHICLE_REQUIRED_DOCS = /* @__PURE__ */ new Set([
    "vehicle:double_license_disk",
    "vehicle:passenger_liability_insurance",
    "vehicle:dekra_report"
  ]);
  function requireStringField(body, field) {
    const value = String(body?.[field] || "").trim();
    if (!value) throw new Error(`${field} is required`);
    return value;
  }
  async function getOrCreateOperatorProfile(options) {
    const existing = await storage.getOperatorProfileByUserId(options.userId);
    if (existing) {
      if (existing.type !== options.type) {
        throw new Error(`This account is already registered as a ${existing.type}`);
      }
      return storage.updateOperatorProfile(existing.id, {
        status: options.status || existing.status,
        submittedAt: /* @__PURE__ */ new Date()
      });
    }
    return storage.createOperatorProfile({
      userId: options.userId,
      type: options.type,
      status: options.status || "pending",
      submittedAt: /* @__PURE__ */ new Date()
    });
  }
  async function serializeOperatorProfile(profile) {
    const [user, chauffeur, partnerProfile] = await Promise.all([
      storage.getUser(profile.userId).catch(() => void 0),
      profile.type === "driver" ? storage.getChauffeurByUserId(profile.userId).catch(() => void 0) : Promise.resolve(null),
      profile.type === "partner" ? storage.getPartnerProfileByOperatorId(profile.id).catch(() => void 0) : Promise.resolve(null)
    ]);
    return { ...profile, user: user || null, chauffeur: chauffeur || null, partnerProfile: partnerProfile || null };
  }
  async function serializeVehicle(vehicle) {
    const [ownerProfile, documents2, assignments] = await Promise.all([
      storage.getOperatorProfile(vehicle.ownerOperatorProfileId).catch(() => void 0),
      storage.getDocumentsByVehicle(vehicle.id).catch(() => []),
      storage.getVehicleAssignments({ vehicleId: vehicle.id }).catch(() => [])
    ]);
    const owner = ownerProfile ? await serializeOperatorProfile(ownerProfile) : null;
    const enrichedAssignments = await Promise.all(assignments.map(async (assignment) => {
      try {
        const driverProfile = await storage.getOperatorProfile(assignment.driverOperatorProfileId).catch(() => void 0);
        return {
          ...assignment,
          driver: driverProfile ? await serializeOperatorProfile(driverProfile) : null
        };
      } catch (error) {
        console.warn("[admin/vehicles] assignment enrichment skipped:", error?.message || error);
        return { ...assignment, driver: null };
      }
    }));
    return { ...vehicle, owner, documents: documents2, assignments: enrichedAssignments };
  }
  async function ensureDriverOperatorForChauffeur(userId) {
    let profile = await storage.getOperatorProfileByUserId(userId);
    const chauffeur = await storage.getChauffeurByUserId(userId).catch(() => void 0);
    if (!chauffeur) return profile || null;
    if (!profile) {
      profile = await storage.createOperatorProfile({
        userId,
        type: "driver",
        status: chauffeur.isApproved ? "approved" : "pending",
        submittedAt: chauffeur.createdAt || /* @__PURE__ */ new Date()
      });
    } else if (profile.type === "driver" && chauffeur.isApproved && profile.status !== "approved") {
      profile = await storage.updateOperatorProfile(profile.id, {
        status: "approved",
        reviewedAt: /* @__PURE__ */ new Date()
      }) || profile;
    }
    if (profile.type !== "driver") return profile;
    const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id).catch(() => []);
    const hasLegacyVehicle = !!(chauffeur.carMake || chauffeur.vehicleModel || chauffeur.plateNumber);
    if (ownedVehicles.length === 0 && hasLegacyVehicle) {
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const vehicleYear = Number(chauffeur.vehicleYear) || currentYear;
      const vehicle = await storage.createVehicle({
        ownerOperatorProfileId: profile.id,
        status: chauffeur.isApproved ? "approved" : "pending",
        submittedAt: chauffeur.createdAt || /* @__PURE__ */ new Date(),
        carMake: String(chauffeur.carMake || "A2B").trim(),
        vehicleModel: String(chauffeur.vehicleModel || "Vehicle").trim(),
        vehicleYear,
        plateNumber: String(chauffeur.plateNumber || `LEGACY-${chauffeur.id.slice(0, 6)}`).trim().toUpperCase(),
        vehicleType: String(chauffeur.vehicleType || "budget").trim(),
        carColor: String(chauffeur.carColor || "Unknown").trim(),
        passengerCapacity: chauffeur.passengerCapacity || 4,
        luggageCapacity: chauffeur.luggageCapacity || 2
      });
      await storage.createVehicleAssignment({
        vehicleId: vehicle.id,
        driverOperatorProfileId: profile.id,
        assignedByOperatorProfileId: profile.id,
        status: "active"
      });
      if (chauffeur.isApproved) {
        await storage.updateChauffeur(chauffeur.id, { activeVehicleId: vehicle.id });
      }
    }
    return profile;
  }
  app2.get("/api/operator-profile/me", requireAuth, async (req, res) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth.sub);
      const chauffeur = await storage.getChauffeurByUserId(req.auth.sub).catch(() => void 0);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const partnerProfile = profile.type === "partner" ? await storage.getPartnerProfileByOperatorId(profile.id) : null;
      return res.json({ profile, partnerProfile, chauffeur: chauffeur || null });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/operator-profile/me/documents", requireAuth, async (req, res) => {
    try {
      const docs = await storage.getDocumentsByUser(req.auth.sub);
      return res.json(docs.filter((doc) => String(doc.type || "").startsWith("driver:") || String(doc.type || "").startsWith("partner:")));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/operator-profile/documents", requireAuth, async (req, res) => {
    try {
      const type = requireStringField(req.body, "type");
      const url = requireStringField(req.body, "url");
      if (!type.startsWith("driver:") && !type.startsWith("partner:")) {
        return res.status(400).json({ message: "Document type must start with driver: or partner:" });
      }
      const existingDocs = await storage.getDocumentsByUser(req.auth.sub);
      const existing = existingDocs.find(
        (doc2) => doc2.type === type && !doc2.applicationId && !doc2.chauffeurId && !doc2.vehicleId
      );
      if (existing) {
        const updated = await storage.updateDocument(existing.id, {
          url,
          status: "pending",
          reviewedAt: null,
          reviewerAdminId: null
        });
        return res.json(updated);
      }
      const doc = await storage.createDocument({
        userId: req.auth.sub,
        applicationId: null,
        chauffeurId: null,
        vehicleId: null,
        type,
        url,
        status: "pending"
      });
      return res.status(201).json(doc);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/operator-profile/driver", requireAuth, async (req, res) => {
    try {
      const phone = requireStringField(req.body, "phone");
      const profile = await getOrCreateOperatorProfile({
        userId: req.auth.sub,
        type: "driver",
        status: "pending"
      });
      if (!profile) return res.status(500).json({ message: "Could not create driver profile" });
      let chauffeur = await storage.getChauffeurByUserId(req.auth.sub);
      if (chauffeur) {
        chauffeur = await storage.updateChauffeur(chauffeur.id, {
          phone,
          profilePhoto: req.body.profilePhoto || chauffeur.profilePhoto,
          isApproved: profile.status === "approved" ? true : chauffeur.isApproved
        });
      } else {
        chauffeur = await storage.createChauffeur({
          userId: req.auth.sub,
          phone,
          profilePhoto: req.body.profilePhoto || null,
          isApproved: false
        });
      }
      await storage.updateUser(req.auth.sub, { role: "chauffeur", phone });
      let application = await storage.getDriverApplicationByUserId(req.auth.sub);
      if (application) {
        application = await storage.updateDriverApplication(application.id, {
          chauffeurId: chauffeur.id,
          status: "pending",
          submittedAt: /* @__PURE__ */ new Date()
        });
      } else {
        application = await storage.createDriverApplication({
          userId: req.auth.sub,
          chauffeurId: chauffeur.id,
          status: "pending",
          submittedAt: /* @__PURE__ */ new Date()
        });
      }
      return res.status(201).json({ profile, chauffeur, application });
    } catch (error) {
      const message = error.message || "Failed to submit driver profile";
      return res.status(message.includes("already registered") ? 409 : 400).json({ message });
    }
  });
  app2.post("/api/operator-profile/partner", requireAuth, async (req, res) => {
    try {
      const partnerData = {
        companyName: requireStringField(req.body, "companyName"),
        registrationNumber: requireStringField(req.body, "registrationNumber"),
        contactPersonName: requireStringField(req.body, "contactPersonName"),
        contactPhone: requireStringField(req.body, "contactPhone"),
        contactEmail: requireStringField(req.body, "contactEmail"),
        bankName: requireStringField(req.body, "bankName"),
        accountHolder: requireStringField(req.body, "accountHolder"),
        accountNumber: requireStringField(req.body, "accountNumber")
      };
      const docs = await storage.getDocumentsByUser(req.auth.sub);
      const uploadedTypes = new Set(docs.map((doc) => doc.type));
      const missingDocs = [...PARTNER_REQUIRED_DOCS].filter((type) => !uploadedTypes.has(type));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          message: `Please upload all required partner documents: ${missingDocs.map((type) => type.replace("partner:", "")).join(", ")}`
        });
      }
      const profile = await getOrCreateOperatorProfile({
        userId: req.auth.sub,
        type: "partner",
        status: "pending"
      });
      if (!profile) return res.status(500).json({ message: "Could not create partner profile" });
      const existingPartnerProfile = await storage.getPartnerProfileByOperatorId(profile.id);
      const partnerProfile = existingPartnerProfile ? await storage.updatePartnerProfile(existingPartnerProfile.id, partnerData) : await storage.createPartnerProfile({
        operatorProfileId: profile.id,
        ...partnerData
      });
      await storage.updateUser(req.auth.sub, { role: "chauffeur", phone: partnerData.contactPhone });
      return res.status(201).json({ profile, partnerProfile });
    } catch (error) {
      const message = error.message || "Failed to submit partner profile";
      return res.status(message.includes("already registered") ? 409 : 400).json({ message });
    }
  });
  app2.get("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id);
      const assignments = profile.type === "driver" ? await storage.getVehicleAssignments({ driverOperatorProfileId: profile.id, status: "active" }) : [];
      const assignedVehicles = await Promise.all(
        assignments.filter((assignment) => !ownedVehicles.some((vehicle) => vehicle.id === assignment.vehicleId)).map((assignment) => storage.getVehicle(assignment.vehicleId))
      );
      return res.json({
        vehicles: [...ownedVehicles, ...assignedVehicles.filter(Boolean)],
        assignments
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/vehicles", requireAuth, async (req, res) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved before adding vehicles." });
      }
      const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
      const vehicleYear = Number.parseInt(requireStringField(req.body, "vehicleYear"), 10);
      if (!Number.isFinite(vehicleYear) || vehicleYear < 2015 || vehicleYear > currentYear + 1) {
        return res.status(400).json({ message: `Please enter a vehicle model year between 2015 and ${currentYear + 1}.` });
      }
      const vehicle = await storage.createVehicle({
        ownerOperatorProfileId: profile.id,
        status: req.body.submit ? "pending" : "draft",
        submittedAt: req.body.submit ? /* @__PURE__ */ new Date() : null,
        carMake: requireStringField(req.body, "carMake"),
        vehicleModel: requireStringField(req.body, "vehicleModel"),
        vehicleYear,
        plateNumber: requireStringField(req.body, "plateNumber").toUpperCase(),
        vehicleType: requireStringField(req.body, "vehicleType"),
        carColor: requireStringField(req.body, "carColor"),
        passengerCapacity: Number.parseInt(String(req.body.passengerCapacity || "4"), 10) || 4,
        luggageCapacity: Number.parseInt(String(req.body.luggageCapacity || "2"), 10) || 2
      });
      return res.status(201).json(vehicle);
    } catch (error) {
      const rawMessage = String(error?.message || "");
      const isDuplicatePlate = error?.code === "23505" || rawMessage.includes("vehicles_active_plate_unique") || rawMessage.toLowerCase().includes("duplicate key");
      if (isDuplicatePlate) {
        return res.status(409).json({
          message: "This number plate is already registered on A2B. If this is your vehicle, contact A2B support to have it released to your account."
        });
      }
      return res.status(400).json({ message: rawMessage });
    }
  });
  app2.get("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const assignment = await storage.getActiveVehicleAssignment(vehicle.id, profile.id);
      if (vehicle.ownerOperatorProfileId !== profile.id && !assignment && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const documents2 = await storage.getDocumentsByVehicle(vehicle.id);
      return res.json({ vehicle, documents: documents2, assignment: assignment || null });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/vehicles/:id", requireAuth, async (req, res) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (req.auth.role !== "admin") {
        const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
        if (!profile) return res.status(404).json({ message: "Operator profile not found" });
        if (vehicle.ownerOperatorProfileId !== profile.id) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      if (vehicle.status === "approved" && req.auth.role !== "admin") {
        return res.status(400).json({ message: "Approved vehicles cannot be edited from the app. Contact support." });
      }
      const update = {};
      for (const field of ["carMake", "vehicleModel", "plateNumber", "vehicleType", "carColor"]) {
        if (req.body[field] !== void 0) update[field] = String(req.body[field]).trim();
      }
      if (req.body.vehicleYear !== void 0) update.vehicleYear = Number.parseInt(String(req.body.vehicleYear), 10);
      if (req.body.passengerCapacity !== void 0) update.passengerCapacity = Number.parseInt(String(req.body.passengerCapacity), 10) || 4;
      if (req.body.luggageCapacity !== void 0) update.luggageCapacity = Number.parseInt(String(req.body.luggageCapacity), 10) || 2;
      const updated = await storage.updateVehicle(vehicle.id, update);
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/vehicles/:id/documents", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.ownerOperatorProfileId !== profile.id && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const type = requireStringField(req.body, "type");
      const url = requireStringField(req.body, "url");
      if (!VEHICLE_REQUIRED_DOCS.has(type)) {
        return res.status(400).json({ message: "Invalid vehicle document type" });
      }
      const doc = await storage.createDocument({
        userId: req.auth.sub,
        applicationId: null,
        chauffeurId: null,
        vehicleId: vehicle.id,
        type,
        url,
        status: "pending"
      });
      return res.status(201).json(doc);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/vehicles/:id/submit", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (vehicle.ownerOperatorProfileId !== profile.id && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const docs = await storage.getDocumentsByVehicle(vehicle.id);
      const uploadedTypes = new Set(docs.map((doc) => doc.type));
      const missingDocs = [...VEHICLE_REQUIRED_DOCS].filter((type) => !uploadedTypes.has(type));
      if (missingDocs.length > 0) {
        return res.status(400).json({
          message: `Please upload all required vehicle documents: ${missingDocs.map((type) => type.replace("vehicle:", "")).join(", ")}`
        });
      }
      const updated = await storage.updateVehicle(vehicle.id, { status: "pending", submittedAt: /* @__PURE__ */ new Date(), rejectionReason: null });
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.post("/api/vehicles/:id/select-active", requireAuth, async (req, res) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.type !== "driver" || profile.status !== "approved") {
        return res.status(403).json({ message: "Only approved drivers can select a driving vehicle." });
      }
      const [vehicle, chauffeur] = await Promise.all([
        storage.getVehicle(req.params.id),
        storage.getChauffeurByUserId(req.auth.sub)
      ]);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (!chauffeur) return res.status(404).json({ message: "Driver profile not found" });
      if (vehicle.status !== "approved") {
        return res.status(400).json({ message: "Select an approved vehicle before going online." });
      }
      const assignment = await storage.getActiveVehicleAssignment(vehicle.id, profile.id);
      if (!assignment) {
        return res.status(403).json({ message: "This vehicle is no longer approved or assigned to you." });
      }
      const updated = await storage.updateChauffeur(chauffeur.id, { activeVehicleId: vehicle.id });
      return res.json({ activeVehicleId: vehicle.id, chauffeur: updated });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/fleet/approved-drivers", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const query = String(req.query.q || "").trim().toLowerCase();
      const driverProfiles = await storage.getOperatorProfiles({ type: "driver", status: "approved" });
      const drivers = await Promise.all(driverProfiles.map(serializeOperatorProfile));
      const filtered = drivers.filter((driver) => driver.id !== profile.id).filter((driver) => {
        if (!query) return true;
        const haystack = [
          driver.user?.name,
          driver.user?.username,
          driver.user?.phone,
          driver.chauffeur?.phone
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      }).slice(0, 25);
      return res.json({ drivers: filtered });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/fleet/drivers/search", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const query = String(req.query.q || "").trim().toLowerCase();
      const driverProfiles = await storage.getOperatorProfiles({ type: "driver", status: "approved" });
      const drivers = await Promise.all(driverProfiles.map(serializeOperatorProfile));
      const filtered = drivers.filter((driver) => driver.id !== profile.id).filter((driver) => {
        if (!query) return true;
        const haystack = [
          driver.user?.name,
          driver.user?.username,
          driver.user?.phone,
          driver.chauffeur?.phone
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      }).slice(0, 25);
      return res.json({ drivers: filtered });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/fleet/overview", requireAuth, async (req, res) => {
    try {
      const profile = await ensureDriverOperatorForChauffeur(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const vehicles2 = await storage.getVehiclesByOwnerOperator(profile.id);
      const vehicleIds = new Set(vehicles2.map((vehicle) => vehicle.id));
      const assignments = await storage.getVehicleAssignments(
        profile.type === "driver" ? { driverOperatorProfileId: profile.id, status: "active" } : { assignedByOperatorProfileId: profile.id, status: "active" }
      );
      assignments.forEach((assignment) => vehicleIds.add(assignment.vehicleId));
      const activeStatuses = /* @__PURE__ */ new Set(["chauffeur_assigned", "chauffeur_arriving", "trip_started"]);
      const activeTrips = (await storage.getAllRides()).filter((ride) => ride.vehicleId && vehicleIds.has(ride.vehicleId) && activeStatuses.has(ride.status));
      return res.json({
        overview: {
          vehicles: vehicles2.length,
          approvedVehicles: vehicles2.filter((vehicle) => vehicle.status === "approved").length,
          pendingApprovals: vehicles2.filter((vehicle) => vehicle.status === "pending").length,
          assignedDrivers: new Set(assignments.map((assignment) => assignment.driverOperatorProfileId)).size,
          activeTrips: activeTrips.length
        }
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/fleet/assignments", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const assignments = await storage.getVehicleAssignments(
        profile.type === "driver" ? { driverOperatorProfileId: profile.id } : { assignedByOperatorProfileId: profile.id }
      );
      const enriched = await Promise.all(assignments.map(async (assignment) => {
        const [vehicle, driverProfile] = await Promise.all([
          storage.getVehicle(assignment.vehicleId),
          storage.getOperatorProfile(assignment.driverOperatorProfileId)
        ]);
        return {
          ...assignment,
          vehicle: vehicle || null,
          driver: driverProfile ? await serializeOperatorProfile(driverProfile) : null
        };
      }));
      return res.json({ assignments: enriched });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/fleet/assignments", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      if (profile.status !== "approved") {
        return res.status(403).json({ message: "Your operator profile must be approved first." });
      }
      const vehicleId = requireStringField(req.body, "vehicleId");
      const driverOperatorProfileId = requireStringField(req.body, "driverOperatorProfileId");
      const [vehicle, driverProfile] = await Promise.all([
        storage.getVehicle(vehicleId),
        storage.getOperatorProfile(driverOperatorProfileId)
      ]);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      if (!driverProfile || driverProfile.type !== "driver" || driverProfile.status !== "approved") {
        return res.status(400).json({ message: "Only approved A2B drivers can be assigned to vehicles." });
      }
      if (vehicle.ownerOperatorProfileId !== profile.id) {
        return res.status(403).json({ message: "You can only assign drivers to vehicles you own." });
      }
      if (vehicle.status !== "approved") {
        return res.status(400).json({ message: "Vehicle must be approved before assigning a driver." });
      }
      const existing = await storage.getActiveVehicleAssignment(vehicle.id, driverProfile.id);
      if (existing) return res.status(409).json({ message: "This driver is already assigned to this vehicle." });
      const assignment = await storage.createVehicleAssignment({
        vehicleId: vehicle.id,
        driverOperatorProfileId: driverProfile.id,
        assignedByOperatorProfileId: profile.id,
        status: "active"
      });
      const ownerLabel = profile.type === "partner" ? "A fleet partner" : "A2B LIFT";
      await notifyUserEvent({
        userId: driverProfile.userId,
        type: "vehicle_assignment",
        title: "Vehicle assigned",
        body: `${ownerLabel} assigned you to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).`,
        data: { vehicleId: vehicle.id, assignmentId: assignment.id }
      });
      if (driverProfile.userId !== profile.userId) {
        await notifyUserEvent({
          userId: profile.userId,
          type: "vehicle_assignment",
          title: "Driver assigned",
          body: "The driver has been linked to your vehicle.",
          data: { vehicleId: vehicle.id, assignmentId: assignment.id }
        });
      }
      return res.status(201).json(assignment);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/fleet/assignments/:id", requireAuth, async (req, res) => {
    try {
      const profile = await storage.getOperatorProfileByUserId(req.auth.sub);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const [assignment] = await storage.getVehicleAssignments({ status: "active" }).then((rows) => rows.filter((row) => row.id === req.params.id));
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.assignedByOperatorProfileId !== profile.id && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const [updated, vehicle, driverProfile] = await Promise.all([
        storage.updateVehicleAssignment(assignment.id, { status: "removed", removedAt: /* @__PURE__ */ new Date() }),
        storage.getVehicle(assignment.vehicleId),
        storage.getOperatorProfile(assignment.driverOperatorProfileId)
      ]);
      if (driverProfile) {
        const chauffeur = await storage.getChauffeurByUserId(driverProfile.userId).catch(() => void 0);
        if (chauffeur?.activeVehicleId === assignment.vehicleId) {
          await storage.updateChauffeur(chauffeur.id, { activeVehicleId: null, isOnline: false });
        }
        await notifyUserEvent({
          userId: driverProfile.userId,
          type: "vehicle_assignment_removed",
          title: "Vehicle assignment removed",
          body: vehicle ? `You are no longer assigned to ${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}).` : "A vehicle assignment was removed.",
          data: { vehicleId: assignment.vehicleId, assignmentId: assignment.id }
        });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/user/:userId", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.params.userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const application = await storage.getDriverApplicationByUserId(req.params.userId).catch(() => void 0);
      return res.json({
        ...chauffeur,
        applicationStatus: application?.status || (chauffeur.isApproved ? "approved" : "pending"),
        applicationNotes: application?.notes || null,
        waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id/push-token", requireAuth, async (req, res) => {
    try {
      const { pushToken } = req.body;
      if (!pushToken || typeof pushToken !== "string") {
        return res.status(400).json({ message: "pushToken is required" });
      }
      if (!pushToken.startsWith("ExponentPushToken[") && !pushToken.startsWith("ExpoPushToken[")) {
        return res.status(400).json({ message: "Invalid Expo push token" });
      }
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId !== req.auth.sub && req.auth.role !== "admin") {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.updateChauffeur(req.params.id, { pushToken });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const [ratings, earningsList] = await Promise.all([
        storage.getRatingsByChauffeur(req.params.id),
        storage.getEarningsByChauffeur(req.params.id).catch(() => [])
      ]);
      const application = chauffeur.userId ? await storage.getDriverApplicationByUserId(chauffeur.userId).catch(() => void 0) : void 0;
      const computedRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)) : null;
      const cardEarningsTotal = earningsList.filter((e) => e.type === "card" || e.type === "wallet").reduce((s, e) => s + (e.amount || 0), 0);
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCardEarnings = earningsList.filter((e) => e.createdAt && new Date(e.createdAt) >= todayStart && (e.type === "card" || e.type === "wallet")).reduce((s, e) => s + (e.amount || 0), 0);
      const chauffeurRides = await storage.getRidesByChauffeur(req.params.id);
      const todayCashFares = chauffeurRides.filter((r) => r.status === "trip_completed" && r.paymentMethod === "cash" && r.completedAt && new Date(r.completedAt) >= todayStart).reduce((s, r) => s + calculateChauffeurEarnings(r.price || 0).chauffeurEarnings, 0);
      const todayEarnings = Math.round(todayCardEarnings + todayCashFares);
      return res.json({
        ...chauffeur,
        computedRating,
        totalRatings: ratings.length,
        cardEarningsTotal,
        todayEarnings,
        applicationStatus: application?.status || (chauffeur.isApproved ? "approved" : "pending"),
        applicationNotes: application?.notes || null,
        waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/details", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)) : null;
      return res.json({
        ...chauffeur,
        driverName: user?.name || "Chauffeur",
        driverPhone: chauffeur.phone || user?.phone || null,
        driverRating: avgRating,
        totalRatings: ratings.length
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/profile", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const user = await storage.getUser(chauffeur.userId);
      const ratings = await storage.getRatingsByChauffeur(req.params.id);
      const avgRating = ratings.length > 0 ? parseFloat((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(2)) : null;
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      ratings.forEach((r) => {
        distribution[r.rating] = (distribution[r.rating] || 0) + 1;
      });
      const uniqueClientIds = [...new Set(ratings.slice(0, 30).map((r) => r.clientId))];
      const reviewerMap = {};
      await Promise.all(
        uniqueClientIds.map(async (id) => {
          const u = await storage.getUser(id);
          if (u) reviewerMap[id] = u.name;
        })
      );
      const ratingsWithNames = ratings.slice(0, 30).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        reviewerName: reviewerMap[r.clientId] || "Anonymous"
      }));
      const rides2 = await storage.getRidesByChauffeur(req.params.id);
      const completedTrips = rides2.filter((r) => r.status === "trip_completed").length;
      return res.json({
        id: chauffeur.id,
        driverName: user?.name || "Chauffeur",
        driverRating: avgRating,
        totalRatings: ratings.length,
        completedTrips,
        distribution,
        profilePhoto: chauffeur.profilePhoto,
        carMake: chauffeur.carMake,
        vehicleModel: chauffeur.vehicleModel,
        carColor: chauffeur.carColor,
        plateNumber: chauffeur.plateNumber,
        vehicleCategory: chauffeur.vehicleCategory,
        ratings: ratingsWithNames
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/clients/:id/profile", async (req, res) => {
    try {
      await ensureClientRatingsTable();
      const client = await storage.getUser(req.params.id);
      if (!client) return res.status(404).json({ message: "Client not found" });
      const rides2 = await storage.getRidesByClient(req.params.id);
      const completedTrips = rides2.filter((ride) => ride.status === "trip_completed").length;
      const [summaryResult, distributionResult, reviewsResult] = await Promise.all([
        pool2.query(
          `
            SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating,
                   COUNT(*)::int AS total_ratings
            FROM client_ratings
            WHERE client_id = $1
          `,
          [req.params.id]
        ),
        pool2.query(
          `
            SELECT rating, COUNT(*)::int AS count
            FROM client_ratings
            WHERE client_id = $1
            GROUP BY rating
          `,
          [req.params.id]
        ),
        pool2.query(
          `
            SELECT
              cr.id,
              cr.rating,
              cr.comment,
              cr.created_at AS "createdAt",
              COALESCE(u.name, 'Chauffeur') AS "reviewerName"
            FROM client_ratings cr
            JOIN chauffeurs ch ON ch.id = cr.chauffeur_id
            JOIN users u ON u.id = ch.user_id
            WHERE cr.client_id = $1
            ORDER BY cr.created_at DESC
            LIMIT 30
          `,
          [req.params.id]
        )
      ]);
      const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const row of distributionResult.rows) {
        distribution[Number(row.rating)] = Number(row.count);
      }
      const avgRating = summaryResult.rows[0]?.avg_rating != null ? Number(summaryResult.rows[0].avg_rating) : null;
      const totalRatings = Number(summaryResult.rows[0]?.total_ratings || 0);
      return res.json({
        id: client.id,
        clientName: client.name || getUserFirstName(client, "Client"),
        clientPhone: client.phone || null,
        clientRating: avgRating,
        totalRatings,
        completedTrips,
        memberSince: client.createdAt,
        profilePhoto: client.profilePhoto || null,
        distribution,
        ratings: reviewsResult.rows
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id", async (req, res) => {
    try {
      const { name, ...chauffeurData } = req.body;
      const chauffeur = await storage.updateChauffeur(req.params.id, chauffeurData);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (name && chauffeur.userId) {
        await storage.updateUser(chauffeur.userId, { name: name.trim() });
      }
      return res.json({ ...chauffeur, userName: name || chauffeur.userName });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/chauffeurs/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if (chauffeur.userId) {
        const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app3) await storage.deleteDriverApplication(app3.id);
      }
      await storage.deleteChauffeur(req.params.id);
      return res.json({ message: "Chauffeur deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/approve", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true });
      if (chauffeur.userId) {
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "approval",
          title: "Application approved",
          body: "Your driver profile has been approved. Add or select an approved vehicle before going online."
        });
        try {
          const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app3) {
            await storage.updateDriverApplication(app3.id, {
              status: "approved",
              notes: null,
              reviewedAt: /* @__PURE__ */ new Date(),
              reviewerAdminId: req.auth.sub
            });
          }
        } catch (e) {
          console.error("[approve] application update failed:", e.message);
        }
        try {
          const docs = await storage.getDocumentsByUser(chauffeur.userId);
          for (const doc of docs) {
            await storage.updateDocument(doc.id, { status: "approved" });
          }
        } catch (e) {
          console.error("[approve] document update failed:", e.message);
        }
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/reject", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ message: "Rejection reason is required" });
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: false });
      if (chauffeur.userId) {
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "rejection",
          title: "Application Not Approved",
          body: `Your driver application was not approved. Reason: ${reason.trim()}. Please contact support if you have questions.`
        });
        try {
          const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
          if (app3) {
            await storage.updateDriverApplication(app3.id, {
              status: "rejected",
              notes: reason.trim(),
              reviewedAt: /* @__PURE__ */ new Date(),
              reviewerAdminId: req.auth.sub
            });
          }
        } catch {
        }
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/waitlist", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) return res.status(400).json({ message: "Waitlist reason is required" });
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: false, isOnline: false });
      if (chauffeur.userId) {
        const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app3) {
          await storage.updateDriverApplication(app3.id, {
            status: "waitlisted",
            notes: reason.trim(),
            reviewedAt: /* @__PURE__ */ new Date(),
            reviewerAdminId: req.auth.sub
          });
        } else {
          await storage.createDriverApplication({
            userId: chauffeur.userId,
            chauffeurId: chauffeur.id,
            status: "waitlisted",
            notes: reason.trim(),
            reviewedAt: /* @__PURE__ */ new Date(),
            reviewerAdminId: req.auth.sub
          });
        }
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "waitlisted",
          title: "Driver profile waitlisted",
          body: `Your A2B driver profile has been waitlisted. Reason: ${reason.trim()}`
        });
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/chauffeurs/:id/reactivate", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      await storage.updateChauffeur(req.params.id, { isApproved: true, isOnline: false });
      if (chauffeur.userId) {
        const app3 = await storage.getDriverApplicationByUserId(chauffeur.userId);
        if (app3) {
          await storage.updateDriverApplication(app3.id, {
            status: "approved",
            notes: null,
            reviewedAt: /* @__PURE__ */ new Date(),
            reviewerAdminId: req.auth.sub
          });
        }
        await notifyUserEvent({
          userId: chauffeur.userId,
          type: "approval",
          title: "Driver profile reactivated",
          body: "Your A2B driver profile has been reactivated. You can go online after selecting an approved vehicle."
        });
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs/:id/documents", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const docs = chauffeur.userId ? await storage.getDocumentsByUser(chauffeur.userId) : [];
      return res.json(docs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/chauffeurs/:id/toggle-online", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      const nextOnline = !chauffeur.isOnline;
      if (nextOnline) {
        const application = await storage.getDriverApplicationByUserId(chauffeur.userId).catch(() => void 0);
        if (application?.status === "waitlisted") {
          await storage.updateChauffeur(req.params.id, { isOnline: false });
          return res.status(403).json({ message: application.notes || "Your driver profile is waitlisted. Please contact support before going online." });
        }
        const profile = await ensureDriverOperatorForChauffeur(chauffeur.userId);
        if (profile?.type === "partner") {
          return res.status(403).json({ message: "Partners cannot go online as drivers." });
        }
        if (!profile || profile.status !== "approved" || !chauffeur.isApproved) {
          return res.status(403).json({ message: "Account not yet approved" });
        }
        if (!chauffeur.activeVehicleId) {
          return res.status(400).json({ message: "Select an approved vehicle before going online." });
        }
        const vehicle = await storage.getVehicle(chauffeur.activeVehicleId);
        const assignment = await storage.getActiveVehicleAssignment(chauffeur.activeVehicleId, profile.id);
        if (!vehicle || vehicle.status !== "approved" || !assignment) {
          await storage.updateChauffeur(req.params.id, { activeVehicleId: null, isOnline: false });
          return res.status(400).json({ message: "This vehicle is no longer approved or assigned to you." });
        }
      }
      const updated = await storage.updateChauffeur(req.params.id, {
        isOnline: nextOnline
      });
      if (nextOnline) {
        pumpUnassignedSearchingRides().catch(() => {
        });
      }
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs", async (_req, res) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const [user, application] = c.userId ? await Promise.all([
            storage.getUser(c.userId).catch(() => null),
            storage.getDriverApplicationByUserId(c.userId).catch(() => void 0)
          ]) : [null, void 0];
          return {
            ...c,
            userName: user?.name || "\u2014",
            userPhone: user?.phone || c.phone || "\u2014",
            userEmail: user?.username || "\u2014",
            applicationStatus: application?.status || (c.isApproved ? "approved" : "pending"),
            applicationNotes: application?.notes || null,
            waitlistReason: application?.status === "waitlisted" ? application?.notes || null : null
          };
        })
      );
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/chauffeurs", async (_req, res) => {
    try {
      const allChauffeurs = await storage.getAllChauffeurs();
      const enriched = await Promise.all(
        allChauffeurs.map(async (c) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            ...c,
            userName: user?.name || "\u2014",
            userPhone: user?.phone || c.phone || "\u2014",
            userEmail: user?.username || "\u2014"
          };
        })
      );
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  function normalizeLongDistanceCity(value) {
    return String(value || "").replace(/\([^)]*\)/g, " ").replace(/\b(south africa|sa)\b/gi, " ").split(",")[0].replace(/[^a-zA-Z\s'-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function formatLongDistanceCity(value) {
    const normalized = normalizeLongDistanceCity(value);
    if (!normalized) return "";
    return normalized.replace(/\b\w+/g, (segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  }
  function isFutureLongDistanceDate(value) {
    const raw = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const parsed = /* @__PURE__ */ new Date(`${raw}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    return parsed.getTime() > today.getTime();
  }
  function longDistanceCityMatches(candidate, query) {
    const normalizedQuery = normalizeLongDistanceCity(query);
    if (!normalizedQuery) return true;
    const normalizedCandidate = normalizeLongDistanceCity(candidate);
    if (!normalizedCandidate) return false;
    return normalizedCandidate === normalizedQuery || normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate);
  }
  app2.get("/r/:code", (req, res) => {
    const normalizedCode = String(req.params.code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalizedCode) {
      return res.status(400).send("Invalid reward code");
    }
    const requestedApp = String(req.query.app || req.query.source || req.query.role || "").trim().toLowerCase();
    const appTarget = requestedApp === "driver" || requestedApp === "chauffeur" ? "driver" : "client";
    return res.redirect(302, `https://a2blift.com/referral-launch.html?ref=${encodeURIComponent(normalizedCode)}&app=${encodeURIComponent(appTarget)}`);
  });
  app2.post("/api/long-distance/availability", requireAuth, async (req, res) => {
    try {
      const userId = req.auth.sub;
      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      if (!chauffeur.isApproved) return res.status(403).json({ message: "Account not yet approved" });
      const {
        available,
        from,
        to,
        date,
        pricePerSeat,
        seatsAvailable
      } = req.body;
      const normalizedFrom = formatLongDistanceCity(from);
      const normalizedTo = formatLongDistanceCity(to);
      const normalizedDate = String(date || "").trim();
      const numericPricePerSeat = Number(pricePerSeat);
      const numericSeatsAvailable = Math.max(1, Math.floor(Number(seatsAvailable) || 0));
      if (available) {
        if (!normalizedFrom || !normalizedTo) {
          return res.status(400).json({ message: "Departure city and destination are required" });
        }
        if (normalizeLongDistanceCity(normalizedFrom) === normalizeLongDistanceCity(normalizedTo)) {
          return res.status(400).json({ message: "Departure city and destination must be different" });
        }
        if (!isFutureLongDistanceDate(normalizedDate)) {
          return res.status(400).json({ message: "Travel date must be a future date in YYYY-MM-DD format" });
        }
        if (!Number.isFinite(numericPricePerSeat) || numericPricePerSeat <= 0) {
          return res.status(400).json({ message: "Price per seat must be greater than zero" });
        }
        if (!Number.isFinite(numericSeatsAvailable) || numericSeatsAvailable < 1) {
          return res.status(400).json({ message: "At least one seat must be available" });
        }
      }
      await storage.updateChauffeur(chauffeur.id, {
        availableForLongDistance: available,
        longDistanceFrom: available ? normalizedFrom : null,
        longDistanceTo: available ? normalizedTo : null,
        longDistanceDate: available ? normalizedDate : null,
        longDistancePricePerSeat: available ? numericPricePerSeat : null,
        longDistanceSeatsAvailable: available ? numericSeatsAvailable : 0
      });
      return res.json({ success: true, available });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/long-distance/search", async (req, res) => {
    try {
      const { from, to, date } = req.query;
      const normalizedFrom = formatLongDistanceCity(from);
      const normalizedTo = formatLongDistanceCity(to);
      const normalizedDate = String(date || "").trim();
      const allChauffeurs = await storage.getAllChauffeurs();
      const available = allChauffeurs.filter((c) => {
        if (!c.availableForLongDistance || !c.isApproved) return false;
        if (!longDistanceCityMatches(c.longDistanceFrom, normalizedFrom)) return false;
        if (!longDistanceCityMatches(c.longDistanceTo, normalizedTo)) return false;
        if (normalizedDate && c.longDistanceDate && c.longDistanceDate !== normalizedDate) return false;
        return true;
      });
      const enriched = await Promise.all(
        available.map(async (c) => {
          const user = c.userId ? await storage.getUser(c.userId) : null;
          return {
            id: c.id,
            name: user?.name || "Driver",
            photo: c.profilePhoto || user?.profilePhoto || null,
            vehicleType: c.vehicleType,
            vehicleModel: c.vehicleModel,
            carColor: c.carColor,
            rating: user?.rating || 5,
            from: formatLongDistanceCity(c.longDistanceFrom),
            to: formatLongDistanceCity(c.longDistanceTo),
            date: c.longDistanceDate,
            pricePerSeat: c.longDistancePricePerSeat,
            seatsAvailable: c.longDistanceSeatsAvailable,
            lat: c.lat,
            lng: c.lng
          };
        })
      );
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/long-distance/book", requireAuth, async (req, res) => {
    try {
      const {
        driverId,
        from,
        to,
        date,
        seats,
        paymentMethod,
        paystackRef,
        passengerName,
        passengerPhone
      } = req.body || {};
      const seatsRequested = Math.max(1, Math.floor(Number(seats) || 1));
      const method = paymentMethod === "cash" ? "cash" : paymentMethod === "card" ? "card" : null;
      if (!driverId || !from || !to || !date || !method) {
        return res.status(400).json({ message: "driverId, from, to, date, seats, and a valid payment method are required" });
      }
      const rider = await storage.getUser(req.auth.sub);
      if (!rider) return res.status(404).json({ message: "Passenger not found" });
      const chauffeur = await storage.getChauffeur(driverId);
      if (!chauffeur || !chauffeur.isApproved || !chauffeur.availableForLongDistance) {
        return res.status(404).json({ message: "This route is no longer available" });
      }
      if (chauffeur.userId === rider.id) {
        return res.status(400).json({ message: "You cannot book your own route" });
      }
      const seatsAvailable = Number(chauffeur.longDistanceSeatsAvailable || 0);
      if (seatsAvailable < seatsRequested) {
        return res.status(409).json({ message: `Only ${seatsAvailable} seat${seatsAvailable === 1 ? "" : "s"} remain on this route` });
      }
      const chauffeurUser = await storage.getUser(chauffeur.userId);
      const remainingSeats = seatsAvailable - seatsRequested;
      await storage.updateChauffeur(chauffeur.id, {
        longDistanceSeatsAvailable: remainingSeats,
        availableForLongDistance: remainingSeats > 0
      });
      const bookingFare = Number(chauffeur.longDistancePricePerSeat || 0) * seatsRequested;
      const earningsCalc = calculateChauffeurEarnings(bookingFare);
      if (bookingFare > 0) {
        await storage.createEarning({
          chauffeurId: chauffeur.id,
          rideId: null,
          amount: method === "cash" ? -earningsCalc.commission : earningsCalc.chauffeurEarnings,
          commission: earningsCalc.commission,
          type: `long_distance_${method}`
        });
        await storage.updateChauffeur(chauffeur.id, {
          earningsTotal: (chauffeur.earningsTotal || 0) + (method === "cash" ? -earningsCalc.commission : earningsCalc.chauffeurEarnings)
        });
      }
      const riderFirstName = String(passengerName || rider.name || "Passenger").trim().split(" ")[0] || "Passenger";
      const routeFrom = chauffeur.longDistanceFrom || from;
      const routeTo = chauffeur.longDistanceTo || to;
      const travelDate = chauffeur.longDistanceDate || date;
      const paymentNote = method === "cash" ? "The rider selected cash payment for the day of travel." : "Card payment was confirmed online.";
      const driverBody = `${riderFirstName} booked ${seatsRequested} seat${seatsRequested === 1 ? "" : "s"} for ${routeFrom} to ${routeTo} on ${travelDate}. ${paymentNote}`;
      await storage.createNotification({
        userId: chauffeur.userId,
        title: "New long-distance booking",
        body: driverBody,
        type: "long_distance"
      });
      const pushTokens = Array.from(new Set([chauffeur.pushToken, chauffeurUser?.pushToken].filter(Boolean)));
      if (pushTokens.length) {
        sendExpoPushNotification(
          pushTokens,
          "New long-distance booking",
          `${riderFirstName} booked ${seatsRequested} seat${seatsRequested === 1 ? "" : "s"} for ${routeFrom} to ${routeTo}.`,
          {
            type: "long_distance:booking",
            driverId: chauffeur.id,
            passengerId: rider.id,
            from: routeFrom,
            to: routeTo,
            date: travelDate,
            seats: seatsRequested,
            paymentMethod: method,
            paystackRef: paystackRef || null,
            passengerPhone: passengerPhone || rider.phone || null
          },
          { urgent: true, channelId: "ride-alerts-v3" }
        );
      }
      await storage.createNotification({
        userId: rider.id,
        title: "Long-distance trip confirmed",
        body: `${routeFrom} to ${routeTo} on ${travelDate} is confirmed with ${chauffeurUser?.name || "your driver"}. ${method === "cash" ? "Pay your driver in cash on the day." : "Your card payment has been recorded."}`,
        type: "long_distance"
      });
      if (bookingFare > 0) {
        try {
          await creditReferralReward({
            referredUserId: chauffeur.userId,
            sourceUserId: chauffeur.userId,
            grossFare: bookingFare,
            type: "driver_referral_commission",
            description: "2.5% reward programme earning from a long-distance booking by a driver you invited",
            notificationBody: "You earned R {amount} \u2014 2.5% from a long-distance booking by a driver you invited.",
            referencePrefix: "drv_ld_ref"
          });
          await creditReferralReward({
            riderUserId: rider.id,
            sourceUserId: rider.id,
            grossFare: bookingFare,
            type: "rider_referral_commission",
            description: "2.5% reward programme earning from a long-distance booking by a rider you invited",
            notificationBody: "You earned R {amount} \u2014 2.5% from a long-distance booking by a rider you invited.",
            referencePrefix: "rdr_ld_ref"
          });
        } catch (referralErr) {
          console.error("long-distance referral commission failed (non-fatal):", referralErr.message);
        }
      }
      return res.json({
        success: true,
        seatsRemaining: remainingSeats,
        driverName: chauffeurUser?.name || "Driver",
        route: { from: routeFrom, to: routeTo, date: travelDate }
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to confirm long-distance booking" });
    }
  });
  function addBusinessDays(start, businessDays) {
    const result = new Date(start);
    let added = 0;
    while (added < businessDays) {
      result.setDate(result.getDate() + 1);
      const day = result.getDay();
      if (day !== 0 && day !== 6) added += 1;
    }
    return result;
  }
  async function verifyLiftClubPaystack(reference, expectedAmount) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      console.warn("[lift-club] PAYSTACK_SECRET_KEY is missing; accepting client callback reference without server verification.");
      return { ok: true, skipped: true };
    }
    const response = await import_axios.default.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      timeout: 1e4
    });
    const tx = response.data?.data;
    const expectedCents = Math.round(Number(expectedAmount || 0) * 100);
    const paidCents = Math.round(Number(tx?.amount || 0));
    return {
      ok: tx?.status === "success" && paidCents >= expectedCents,
      skipped: false,
      amount: paidCents / 100,
      status: tx?.status
    };
  }
  async function getApprovedLiftClubVehicleForChauffeur(userId, chauffeur) {
    const activeVehicle = chauffeur.activeVehicleId ? await storage.getVehicle(chauffeur.activeVehicleId).catch(() => void 0) : void 0;
    if (activeVehicle && activeVehicle.status === "approved" && Number(activeVehicle.vehicleYear || 0) >= 2015) {
      return activeVehicle;
    }
    const profile = await ensureDriverOperatorForChauffeur(userId);
    if (!profile) return null;
    const ownedVehicles = await storage.getVehiclesByOwnerOperator(profile.id).catch(() => []);
    const assignments = profile.type === "driver" ? await storage.getVehicleAssignments({ driverOperatorProfileId: profile.id, status: "active" }).catch(() => []) : [];
    const assignedVehicles = await Promise.all(
      assignments.map((assignment) => storage.getVehicle(assignment.vehicleId).catch(() => void 0))
    );
    return [...ownedVehicles, ...assignedVehicles.filter(Boolean)].find(
      (vehicle) => vehicle.status === "approved" && Number(vehicle.vehicleYear || 0) >= 2015
    ) || null;
  }
  app2.get("/api/lift-club/routes", async (req, res) => {
    try {
      const routes = await storage.searchLiftClubRoutes({
        from: typeof req.query.from === "string" ? req.query.from : void 0,
        to: typeof req.query.to === "string" ? req.query.to : void 0
      });
      return res.json(routes);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load lift club routes" });
    }
  });
  app2.get("/api/lift-club/membership/me", requireAuth, async (req, res) => {
    try {
      const membership = await storage.getLiftClubMembershipByUser(req.auth.sub);
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load Lift Club membership" });
    }
  });
  app2.post("/api/lift-club/membership/apply", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.auth.sub);
      if (!user) return res.status(404).json({ message: "User not found" });
      const existing = await storage.getLiftClubMembershipByUser(user.id);
      if (existing?.status === "approved") {
        return res.json(serializeLiftClubMembership(existing));
      }
      const membership = await storage.upsertLiftClubMembership({
        userId: user.id,
        status: existing?.status === "pending_review" ? "pending_review" : "pending_payment",
        feeAmount: LIFT_CLUB_APPLICATION_FEE,
        rejectionReason: existing?.status === "rejected" ? existing.rejectionReason : null,
        submittedAt: existing?.submittedAt || /* @__PURE__ */ new Date()
      });
      await storage.createNotification({
        userId: user.id,
        title: "Lift Club application started",
        body: "Your Lift Club application is open. Pay the once-off R200 fee and upload proof for admin review.",
        type: "lift_club_membership"
      }).catch(() => void 0);
      await notifyAdmins(
        "New Lift Club application",
        `${user.name || user.username || "A rider"} started a Lift Club membership application.`,
        "lift_club_membership"
      ).catch(() => void 0);
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to apply for Lift Club membership" });
    }
  });
  app2.post("/api/lift-club/membership/proof", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.auth.sub);
      if (!user) return res.status(404).json({ message: "User not found" });
      const proofUrl = String(req.body?.url || req.body?.proofUrl || "").trim();
      const proofDocumentId = String(req.body?.documentId || "").trim();
      if (!proofUrl && !proofDocumentId) {
        return res.status(400).json({ message: "Proof document URL or documentId is required" });
      }
      const existing = await storage.getLiftClubMembershipByUser(user.id);
      const baseMembership = existing || await storage.upsertLiftClubMembership({
        userId: user.id,
        status: "pending_payment",
        feeAmount: LIFT_CLUB_APPLICATION_FEE,
        submittedAt: /* @__PURE__ */ new Date()
      });
      let documentId = proofDocumentId || "";
      if (!documentId) {
        const doc = await storage.createDocument({
          userId: user.id,
          type: "lift_club_payment_proof",
          url: proofUrl,
          status: "pending"
        });
        documentId = doc.id;
      }
      const membership = await storage.updateLiftClubMembership(baseMembership.id, {
        status: "pending_review",
        proofDocumentId: documentId,
        paidAt: /* @__PURE__ */ new Date(),
        rejectionReason: null
      });
      const admins = (await storage.getAllUsers()).filter((admin) => admin.role === "admin");
      await Promise.all(admins.map((admin) => storage.createNotification({
        userId: admin.id,
        title: "Lift Club proof uploaded",
        body: `${user.name || user.username || "A rider"} uploaded Lift Club payment proof for review.`,
        type: "lift_club_membership"
      }).catch(() => void 0)));
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to upload Lift Club proof" });
    }
  });
  app2.get("/api/admin/lift-club-memberships", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : void 0;
      const memberships = await storage.getLiftClubMemberships({ status });
      return res.json(memberships);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load Lift Club applications" });
    }
  });
  app2.post("/api/admin/lift-club-memberships/convert-user", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const userId = String(req.body?.userId || "").trim();
      const status = String(req.body?.status || "approved").trim();
      const feeAmount = req.body?.feeAmount === void 0 ? LIFT_CLUB_APPLICATION_FEE : Number(req.body.feeAmount);
      const rejectionReason = String(req.body?.rejectionReason || "").trim();
      if (!userId) {
        return res.status(400).json({ message: "User is required" });
      }
      if (!["pending_payment", "pending_review", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid Lift Club membership status" });
      }
      if (!Number.isFinite(feeAmount) || feeAmount < 0) {
        return res.status(400).json({ message: "Fee amount must be a valid number" });
      }
      if (status === "rejected" && !rejectionReason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const existing = await storage.getLiftClubMembershipByUser(userId).catch(() => void 0);
      const now = /* @__PURE__ */ new Date();
      const membership = await storage.upsertLiftClubMembership({
        userId,
        status,
        feeAmount,
        rejectionReason: status === "rejected" ? rejectionReason : null,
        submittedAt: existing?.submittedAt || now,
        paidAt: ["approved", "pending_review"].includes(status) ? existing?.paidAt || now : existing?.paidAt || null,
        reviewedAt: ["approved", "rejected"].includes(status) ? now : null,
        reviewerAdminId: ["approved", "rejected"].includes(status) ? req.auth.sub : null
      });
      if (status === "approved" && existing?.status !== "approved") {
        await creditLiftClubMembershipReferralBonus(userId, membership.id).catch((error) => {
          console.warn("[lift-club] membership referral bonus skipped:", error instanceof Error ? error.message : error);
        });
      }
      await storage.createNotification({
        userId,
        title: status === "approved" ? "Lift Club approved" : "Lift Club membership updated",
        body: status === "approved" ? "Your Lift Club membership is approved. Your yellow Lift Club badge is now active." : status === "pending_payment" ? "Your Lift Club application has been opened. Pay the R200 fee and upload proof for review." : status === "pending_review" ? "Your Lift Club application is waiting for admin review." : `Your Lift Club application was rejected: ${rejectionReason}.`,
        type: "lift_club_membership"
      }).catch(() => void 0);
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to convert user to Lift Club member" });
    }
  });
  app2.put("/api/admin/lift-club-memberships/:id/status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = String(req.body?.status || "").trim();
      if (!["pending_payment", "pending_review", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid Lift Club membership status" });
      }
      const rejectionReason = String(req.body?.rejectionReason || "").trim();
      if (status === "rejected" && !rejectionReason) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }
      const existing = await storage.getLiftClubMembership(req.params.id);
      const membership = await storage.updateLiftClubMembership(req.params.id, {
        status,
        rejectionReason: status === "rejected" ? rejectionReason : null,
        reviewedAt: ["approved", "rejected"].includes(status) ? /* @__PURE__ */ new Date() : null,
        reviewerAdminId: ["approved", "rejected"].includes(status) ? req.auth.sub : null
      });
      if (!membership) return res.status(404).json({ message: "Lift Club membership not found" });
      if (status === "approved" && existing?.status !== "approved") {
        await creditLiftClubMembershipReferralBonus(membership.userId, membership.id).catch((error) => {
          console.warn("[lift-club] membership referral bonus skipped:", error instanceof Error ? error.message : error);
        });
      }
      await storage.createNotification({
        userId: membership.userId,
        title: status === "approved" ? "Lift Club approved" : status === "rejected" ? "Lift Club proof needs attention" : "Lift Club updated",
        body: status === "approved" ? "Your Lift Club membership is approved. You can now book Lift Club seats." : status === "rejected" ? `Your Lift Club application was rejected: ${rejectionReason}. Upload a new proof when ready.` : "Your Lift Club application status has been updated.",
        type: "lift_club_membership"
      }).catch(() => void 0);
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to update Lift Club membership" });
    }
  });
  app2.put("/api/admin/lift-club-memberships/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const updates = {};
      if (req.body?.feeAmount !== void 0) {
        const feeAmount = Number(req.body.feeAmount);
        if (!Number.isFinite(feeAmount) || feeAmount < 0) {
          return res.status(400).json({ message: "Fee amount must be a valid number" });
        }
        updates.feeAmount = feeAmount;
      }
      if (req.body?.rejectionReason !== void 0) {
        updates.rejectionReason = String(req.body.rejectionReason || "").trim() || null;
      }
      if (req.body?.status !== void 0) {
        const status = String(req.body.status || "").trim();
        if (!["pending_payment", "pending_review", "approved", "rejected"].includes(status)) {
          return res.status(400).json({ message: "Invalid Lift Club membership status" });
        }
        updates.status = status;
        if (["approved", "rejected"].includes(status)) {
          updates.reviewedAt = /* @__PURE__ */ new Date();
          updates.reviewerAdminId = req.auth.sub;
        }
      }
      const existing = await storage.getLiftClubMembership(req.params.id);
      const membership = await storage.updateLiftClubMembership(req.params.id, updates);
      if (!membership) return res.status(404).json({ message: "Lift Club membership not found" });
      if (updates.status === "approved" && existing?.status !== "approved") {
        await creditLiftClubMembershipReferralBonus(membership.userId, membership.id).catch((error) => {
          console.warn("[lift-club] membership referral bonus skipped:", error instanceof Error ? error.message : error);
        });
      }
      return res.json(serializeLiftClubMembership(membership));
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to edit Lift Club membership" });
    }
  });
  app2.delete("/api/admin/lift-club-memberships/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteLiftClubMembership(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Lift Club membership not found" });
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to delete Lift Club membership" });
    }
  });
  app2.get("/api/admin/lift-club-routes", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : void 0;
      const routes = await storage.getLiftClubRoutes({ status });
      return res.json(routes);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load Lift Club routes" });
    }
  });
  app2.put("/api/admin/lift-club-routes/:id/status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = String(req.body?.status || "").trim();
      if (!["pending", "active", "inactive", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid Lift Club route status" });
      }
      const route = await storage.updateLiftClubRouteStatusById(req.params.id, status);
      if (!route) return res.status(404).json({ message: "Lift Club route not found" });
      if (route.chauffeurUserId) {
        await storage.createNotification({
          userId: route.chauffeurUserId,
          title: status === "active" ? "Lift Club route approved" : status === "rejected" ? "Lift Club route rejected" : "Lift Club route updated",
          body: status === "active" ? "Your Daily Lift Club route is live and searchable." : status === "rejected" ? "Your Daily Lift Club route needs attention. Please update it or contact support." : "Your Daily Lift Club route status has been updated.",
          type: "lift_club_route"
        }).catch(() => void 0);
      }
      return res.json(route);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to update Lift Club route" });
    }
  });
  app2.get("/api/lift-club/my-route", requireAuth, async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth.sub);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      const route = await storage.getLiftClubRouteByChauffeurId(chauffeur.id);
      const vehicle = await getApprovedLiftClubVehicleForChauffeur(req.auth.sub, chauffeur);
      return res.json({
        route: route || null,
        canPublish: Boolean(chauffeur.isApproved && vehicle),
        isApproved: Boolean(chauffeur.isApproved),
        vehicle: vehicle || null
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load lift club route" });
    }
  });
  app2.post("/api/lift-club/my-route", requireAuth, async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth.sub);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur profile not found" });
      if (!chauffeur.isApproved) return res.status(403).json({ message: "Your driver profile must be approved before publishing a lift club route." });
      const available = req.body?.available !== false;
      if (!available) {
        const route2 = await storage.updateLiftClubRouteStatus(chauffeur.id, "inactive");
        if (route2) {
          await storage.createNotification({
            userId: req.auth.sub,
            title: "Lift Club route disabled",
            body: "Your Daily Lift Club car is no longer visible to members.",
            type: "lift_club_route"
          }).catch(() => void 0);
        }
        return res.json({ success: true, route: route2 || null, available: false });
      }
      const vehicle = await getApprovedLiftClubVehicleForChauffeur(req.auth.sub, chauffeur);
      if (!vehicle) {
        return res.status(403).json({ message: "An approved vehicle from 2015 onwards is required before publishing a lift club route." });
      }
      const pickupArea = String(req.body?.pickupArea || "").trim();
      const destinationArea = String(req.body?.destinationArea || "").trim();
      const departureWindow = String(req.body?.departureWindow || "Weekday mornings").trim();
      const weeklyPrice = Number(req.body?.weeklyPrice);
      const monthlyPrice = Number(req.body?.monthlyPrice);
      const requestedSeats = Math.floor(Number(req.body?.totalSeats) || 0);
      const vehicleCapacity = Math.max(1, Number(vehicle.passengerCapacity || chauffeur.passengerCapacity || 1));
      const totalSeats = Math.max(1, Math.min(vehicleCapacity, requestedSeats || vehicleCapacity));
      if (!pickupArea || !destinationArea) {
        return res.status(400).json({ message: "Pickup area and workplace are required." });
      }
      if (pickupArea.toLowerCase() === destinationArea.toLowerCase()) {
        return res.status(400).json({ message: "Pickup area and workplace must be different." });
      }
      if (!Number.isFinite(weeklyPrice) || weeklyPrice <= 0 || !Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
        return res.status(400).json({ message: "Weekly and monthly prices must be greater than zero." });
      }
      const existingRoute = await storage.getLiftClubRouteByChauffeurId(chauffeur.id);
      const hasBookedSeats = Number(existingRoute?.bookedSeats || 0) > 0;
      const routeChanged = existingRoute && (String(existingRoute.pickupArea || "").trim().toLowerCase() !== pickupArea.toLowerCase() || String(existingRoute.destinationArea || "").trim().toLowerCase() !== destinationArea.toLowerCase());
      if (hasBookedSeats && routeChanged) {
        return res.status(409).json({ message: "This lift club already has booked riders. Turn it off or contact support before changing the route areas." });
      }
      const route = await storage.upsertLiftClubRoute({
        chauffeurId: chauffeur.id,
        vehicleId: vehicle.id,
        pickupArea,
        destinationArea,
        pickupLat: Number.isFinite(Number(req.body?.pickupLat)) ? Number(req.body.pickupLat) : null,
        pickupLng: Number.isFinite(Number(req.body?.pickupLng)) ? Number(req.body.pickupLng) : null,
        destinationLat: Number.isFinite(Number(req.body?.destinationLat)) ? Number(req.body.destinationLat) : null,
        destinationLng: Number.isFinite(Number(req.body?.destinationLng)) ? Number(req.body.destinationLng) : null,
        departureWindow,
        weeklyPrice,
        monthlyPrice,
        totalSeats,
        status: "active"
      });
      await storage.createNotification({
        userId: req.auth.sub,
        title: "Lift Club route published",
        body: `${pickupArea} to ${destinationArea} is now available for Daily Lift Club members.`,
        type: "lift_club_route"
      }).catch(() => void 0);
      await notifyAdmins(
        "Lift Club route published",
        `${chauffeur.driverName || "A driver"} published ${pickupArea} to ${destinationArea} for Lift Club.`,
        "lift_club_route"
      ).catch(() => void 0);
      return res.json({ success: true, route, available: true });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to save lift club route" });
    }
  });
  app2.get("/api/lift-club/my-bookings", requireAuth, async (req, res) => {
    try {
      const bookings = await storage.getLiftClubBookingsByUser(req.auth.sub);
      return res.json(bookings);
    } catch (error) {
      return res.status(500).json({ message: error.message || "Unable to load lift club bookings" });
    }
  });
  app2.post("/api/lift-club/bookings", requireAuth, async (req, res) => {
    try {
      const { routeId, passType, paystackReference } = req.body || {};
      const normalizedPassType = passType === "monthly" ? "monthly" : passType === "weekly" ? "weekly" : null;
      if (!routeId || !normalizedPassType || !paystackReference) {
        return res.status(400).json({ message: "routeId, passType, and Paystack reference are required." });
      }
      const [rider, route] = await Promise.all([
        storage.getUser(req.auth.sub),
        storage.getLiftClubRoute(String(routeId))
      ]);
      if (!rider) return res.status(404).json({ message: "Rider not found." });
      if (!route || route.status !== "active") return res.status(404).json({ message: "Lift club route not found." });
      if (route.chauffeurUserId === rider.id) return res.status(400).json({ message: "You cannot book your own lift club car." });
      if (Number(route.vehicleYear || 0) < 2015) return res.status(409).json({ message: "This vehicle is not eligible for Daily Lift Club." });
      const membership = await storage.getLiftClubMembershipByUser(rider.id);
      if (membership?.status !== "approved") {
        return res.status(403).json({
          message: "Approved Lift Club membership is required before booking a seat.",
          membership: serializeLiftClubMembership(membership)
        });
      }
      const seatsLeft = Number(route.totalSeats || 0) - Number(route.bookedSeats || 0);
      if (seatsLeft <= 0) return res.status(409).json({ message: "This lift club car is already full." });
      const amount = normalizedPassType === "monthly" ? Number(route.monthlyPrice || 0) : Number(route.weeklyPrice || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "This lift club pass is not priced correctly." });
      }
      const verification = await verifyLiftClubPaystack(String(paystackReference), amount);
      if (!verification.ok) {
        return res.status(402).json({ message: "Paystack payment could not be verified." });
      }
      const startDate = /* @__PURE__ */ new Date();
      const endDate = normalizedPassType === "weekly" ? addBusinessDays(startDate, 5) : addBusinessDays(startDate, 22);
      const booking = await storage.confirmLiftClubBookingWithSeat({
        routeId: route.id,
        riderId: rider.id,
        passType: normalizedPassType,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        seatCount: 1,
        amount,
        paymentStatus: "paid",
        bookingStatus: "confirmed",
        paystackReference: String(paystackReference),
        confirmedAt: /* @__PURE__ */ new Date()
      });
      await storage.createNotification({
        userId: rider.id,
        title: "Lift club seat confirmed",
        body: `${route.pickupArea} to ${route.destinationArea} is confirmed for your ${normalizedPassType} weekday pass.`,
        type: "lift_club"
      });
      if (route.chauffeurUserId) {
        await storage.createNotification({
          userId: route.chauffeurUserId,
          title: "New lift club rider",
          body: `${rider.name || "A rider"} booked a ${normalizedPassType} seat for ${route.pickupArea} to ${route.destinationArea}.`,
          type: "lift_club"
        });
      }
      return res.json({ booking, seatsRemaining: seatsLeft - 1 });
    } catch (error) {
      const status = String(error?.message || "").includes("already full") ? 409 : 500;
      return res.status(status).json({ message: error.message || "Unable to confirm lift club booking" });
    }
  });
  app2.get("/api/long-distance/my-availability", requireAuth, async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.auth.sub);
      if (!chauffeur) return res.status(404).json({ message: "Not found" });
      return res.json({
        available: chauffeur.availableForLongDistance || false,
        from: chauffeur.longDistanceFrom || "",
        to: chauffeur.longDistanceTo || "",
        date: chauffeur.longDistanceDate || "",
        pricePerSeat: chauffeur.longDistancePricePerSeat || 0,
        seatsAvailable: chauffeur.longDistanceSeatsAvailable || 1
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/driver/applications/me", authOptional, async (req, res) => {
    const userId = req.auth?.sub || req.query.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const appRow = await storage.getDriverApplicationByUserId(userId);
    return res.json(appRow || null);
  });
  app2.get(
    "/api/admin/driver-applications",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      const apps = await storage.getDriverApplications();
      return res.json(apps);
    }
  );
  app2.get("/api/admin/operator-profiles", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type : void 0;
      const status = typeof req.query.status === "string" ? req.query.status : void 0;
      const profiles = await storage.getOperatorProfiles({ type, status });
      return res.json(await Promise.all(profiles.map(serializeOperatorProfile)));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/admin/operator-profiles/:id/status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = requireStringField(req.body, "status");
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid operator profile status" });
      }
      const profile = await storage.getOperatorProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const reason = String(req.body.reason || "").trim();
      const updated = await storage.updateOperatorProfile(profile.id, {
        status,
        rejectionReason: status === "rejected" ? reason : null,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
      });
      if (profile.type === "driver") {
        const chauffeur = await storage.getChauffeurByUserId(profile.userId).catch(() => void 0);
        if (chauffeur) {
          await storage.updateChauffeur(chauffeur.id, {
            isApproved: status === "approved",
            ...status === "rejected" ? { isOnline: false, activeVehicleId: null } : {}
          });
        }
        const application = await storage.getDriverApplicationByUserId(profile.userId).catch(() => void 0);
        if (application) {
          await storage.updateDriverApplication(application.id, {
            status,
            notes: reason || application.notes,
            reviewedAt: /* @__PURE__ */ new Date(),
            reviewerAdminId: req.auth.sub
          });
        }
      }
      await notifyUserEvent({
        userId: profile.userId,
        type: `operator_${status}`,
        title: status === "approved" ? "Application approved" : status === "rejected" ? "Application not approved" : "Application updated",
        body: status === "approved" ? profile.type === "partner" ? "Your partner profile has been approved. You can now add vehicles and assign approved drivers." : "Your driver profile has been approved. Add or select an approved vehicle before going online." : status === "rejected" ? `Your ${profile.type} application was not approved.${reason ? ` Reason: ${reason}.` : ""}` : "Your application is back under review.",
        data: { operatorProfileId: profile.id }
      });
      return res.json(await serializeOperatorProfile(updated));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.put("/api/admin/operator-profiles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const profile = await storage.getOperatorProfile(req.params.id);
      if (!profile) return res.status(404).json({ message: "Operator profile not found" });
      const profileUpdate = {};
      if (req.body.status !== void 0) {
        const status = String(req.body.status).trim();
        if (!["draft", "pending", "approved", "rejected"].includes(status)) {
          return res.status(400).json({ message: "Invalid operator profile status" });
        }
        profileUpdate.status = status;
      }
      if (req.body.rejectionReason !== void 0) {
        profileUpdate.rejectionReason = String(req.body.rejectionReason || "").trim() || null;
      }
      const updatedProfile = Object.keys(profileUpdate).length ? await storage.updateOperatorProfile(profile.id, profileUpdate) : profile;
      if (profile.type === "partner") {
        const partnerProfile = await storage.getPartnerProfileByOperatorId(profile.id);
        const partnerUpdate = {};
        for (const field of ["companyName", "registrationNumber", "contactPersonName", "contactPhone", "contactEmail", "bankName", "accountHolder", "accountNumber"]) {
          if (req.body[field] !== void 0) partnerUpdate[field] = String(req.body[field]).trim();
        }
        if (partnerProfile && Object.keys(partnerUpdate).length) {
          await storage.updatePartnerProfile(partnerProfile.id, partnerUpdate);
        }
      }
      return res.json(await serializeOperatorProfile(updatedProfile));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/operator-profiles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteOperatorProfile(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Operator profile not found" });
      return res.json({ message: "Operator profile deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/admin/vehicles", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : void 0;
      const vehicles2 = await storage.getVehicles({ status });
      const serialized = await Promise.all(vehicles2.map(async (vehicle) => {
        try {
          return await serializeVehicle(vehicle);
        } catch (error) {
          console.error("[admin/vehicles] serialize failed:", vehicle?.id, error?.message || error);
          return { ...vehicle, owner: null, documents: [], assignments: [], serializationWarning: error?.message || "Vehicle details partially unavailable" };
        }
      }));
      return res.json(serialized);
    } catch (error) {
      console.error("[admin/vehicles] load failed:", error?.message || error);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/admin/vehicles/:id/status", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const status = requireStringField(req.body, "status");
      if (!["approved", "rejected", "suspended", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid vehicle status" });
      }
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const ownerProfile = await storage.getOperatorProfile(vehicle.ownerOperatorProfileId);
      if (!ownerProfile) return res.status(404).json({ message: "Vehicle owner profile not found" });
      const reason = String(req.body.reason || "").trim();
      const updated = await storage.updateVehicle(vehicle.id, {
        status,
        rejectionReason: status === "rejected" || status === "suspended" ? reason : null,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
      });
      if (status === "approved" && ownerProfile.type === "driver") {
        try {
          const existing = await storage.getActiveVehicleAssignment(vehicle.id, ownerProfile.id);
          if (!existing) {
            await storage.createVehicleAssignment({
              vehicleId: vehicle.id,
              driverOperatorProfileId: ownerProfile.id,
              assignedByOperatorProfileId: ownerProfile.id,
              status: "active"
            });
          }
        } catch (error) {
          console.warn("[admin/vehicles] self-assignment skipped:", error?.message || error);
        }
      }
      if (status !== "approved") {
        const activeAssignments = await storage.getVehicleAssignments({ vehicleId: vehicle.id, status: "active" }).catch(() => []);
        for (const assignment of activeAssignments) {
          try {
            await storage.updateVehicleAssignment(assignment.id, { status: "removed", removedAt: /* @__PURE__ */ new Date() });
            const driverProfile = await storage.getOperatorProfile(assignment.driverOperatorProfileId).catch(() => void 0);
            if (driverProfile) {
              const chauffeur = await storage.getChauffeurByUserId(driverProfile.userId).catch(() => void 0);
              if (chauffeur?.activeVehicleId === vehicle.id) {
                await storage.updateChauffeur(chauffeur.id, { activeVehicleId: null, isOnline: false });
              }
              if (driverProfile.userId !== ownerProfile.userId) {
                await notifyUserEvent({
                  userId: driverProfile.userId,
                  type: "vehicle_assignment_removed",
                  title: "Vehicle unavailable",
                  body: `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) is no longer available for trips.`,
                  data: { vehicleId: vehicle.id }
                }).catch(() => void 0);
              }
            }
          } catch (error) {
            console.warn("[admin/vehicles] assignment removal skipped:", error?.message || error);
          }
        }
      }
      await notifyUserEvent({
        userId: ownerProfile.userId,
        type: `vehicle_${status}`,
        title: status === "approved" ? "Vehicle approved" : status === "rejected" ? "Vehicle not approved" : "Vehicle status updated",
        body: status === "approved" ? `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) has been approved.` : status === "rejected" ? `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) was not approved.${reason ? ` Reason: ${reason}.` : ""}` : `${vehicle.carMake} ${vehicle.vehicleModel} (${vehicle.plateNumber}) status is now ${status}.`,
        data: { vehicleId: vehicle.id }
      }).catch((error) => {
        console.warn("[admin/vehicles] notification skipped:", error?.message || error);
      });
      return res.json(await serializeVehicle(updated));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.put("/api/admin/vehicles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const vehicle = await storage.getVehicle(req.params.id);
      if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
      const update = {};
      for (const field of ["carMake", "vehicleModel", "plateNumber", "vehicleType", "carColor", "status", "rejectionReason"]) {
        if (req.body[field] !== void 0) update[field] = String(req.body[field]).trim();
      }
      if (req.body.vehicleYear !== void 0) update.vehicleYear = Number.parseInt(String(req.body.vehicleYear), 10);
      if (req.body.passengerCapacity !== void 0) update.passengerCapacity = Number.parseInt(String(req.body.passengerCapacity), 10) || 4;
      if (req.body.luggageCapacity !== void 0) update.luggageCapacity = Number.parseInt(String(req.body.luggageCapacity), 10) || 2;
      const updated = await storage.updateVehicle(vehicle.id, update);
      return res.json(await serializeVehicle(updated));
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/vehicles/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteVehicle(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Vehicle not found" });
      return res.json({ message: "Vehicle deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      const { status, notes } = req.body;
      if (!["pending", "approved", "rejected", "waitlisted"].includes(String(status || ""))) {
        return res.status(400).json({ message: "Invalid driver application status" });
      }
      if (status === "waitlisted" && !String(notes || "").trim()) {
        return res.status(400).json({ message: "Waitlist reason is required" });
      }
      const updated = await storage.updateDriverApplication(req.params.id, {
        status,
        notes,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
      });
      if (!updated) return res.status(404).json({ message: "Application not found" });
      if (updated.chauffeurId) {
        if (status === "approved") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: true });
        }
        if (status === "rejected") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: false, isOnline: false, activeVehicleId: null });
        }
        if (status === "waitlisted") {
          await storage.updateChauffeur(updated.chauffeurId, { isApproved: false, isOnline: false });
        }
      }
      const profile = await storage.getOperatorProfileByUserId(updated.userId).catch(() => void 0);
      if (profile?.type === "driver") {
        await storage.updateOperatorProfile(profile.id, {
          status,
          rejectionReason: status === "rejected" || status === "waitlisted" ? String(notes || "").trim() : null,
          reviewedAt: /* @__PURE__ */ new Date(),
          reviewerAdminId: req.auth.sub
        });
      }
      if (status === "approved" || status === "rejected" || status === "waitlisted") {
        await notifyUserEvent({
          userId: updated.userId,
          type: status === "approved" ? "operator_approved" : status === "waitlisted" ? "waitlisted" : "operator_rejected",
          title: status === "approved" ? "Application approved" : status === "waitlisted" ? "Driver profile waitlisted" : "Application not approved",
          body: status === "approved" ? "Your driver profile has been approved. Add or select an approved vehicle before going online." : status === "waitlisted" ? `Your driver profile has been waitlisted.${notes ? ` Reason: ${String(notes).trim()}.` : ""}` : `Your driver application was not approved.${notes ? ` Reason: ${String(notes).trim()}.` : ""}`,
          data: { driverApplicationId: updated.id, operatorProfileId: profile?.id }
        });
      }
      return res.json(updated);
    }
  );
  app2.delete(
    "/api/admin/driver-applications/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      try {
        const deleted = await storage.deleteDriverApplication(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Application not found" });
        return res.json({ message: "Application deleted" });
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.post("/api/upload/profile-photo", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { base64Data, chauffeurId } = req.body;
      if (!base64Data || typeof base64Data !== "string" || !chauffeurId || typeof chauffeurId !== "string") {
        return res.status(400).json({ message: "base64Data and chauffeurId are required" });
      }
      if (base64Data.length > 7e6) {
        return res.status(400).json({ message: "Image too large. Maximum 5 MB." });
      }
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_SERVICE_KEY2 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const safeId = chauffeurId.replace(/[^a-zA-Z0-9_-]/g, "");
      const fileName = `${safeId}/profile_${Date.now()}.jpg`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL2}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY2}`,
            apikey: SUPABASE_SERVICE_KEY2,
            "Content-Type": "image/jpeg",
            "x-upsert": "true"
          },
          body: buffer
        }
      );
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => uploadRes.statusText);
        console.error("[upload/profile-photo] Supabase error:", uploadRes.status, errText);
        if (uploadRes.status === 401 || uploadRes.status === 403) {
          return res.status(500).json({ message: "Photo upload failed: Supabase service key not configured. Please add SUPABASE_SERVICE_ROLE_KEY to environment secrets." });
        }
        return res.status(500).json({ message: `Photo upload failed (${uploadRes.status}): ${errText}` });
      }
      const url = `${SUPABASE_URL2}/storage/v1/object/public/${BUCKET}/${fileName}`;
      try {
        await storage.updateChauffeur(chauffeurId, { profilePhoto: url });
      } catch {
      }
      return res.json({ url });
    } catch (error) {
      console.error("[upload/profile-photo] error:", error.message);
      return res.status(500).json({ message: error.message || "Photo upload failed. Please try again." });
    }
  });
  app2.post("/api/upload-document", authOptional, async (req, res) => {
    try {
      const { base64Data, userId, docType, mimeType, fileExtension } = req.body;
      if (!base64Data || !userId || !docType) {
        return res.status(400).json({ message: "base64Data, userId, and docType are required" });
      }
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const BUCKET = "driver-documents";
      const contentType = typeof mimeType === "string" && mimeType.includes("/") ? mimeType : "image/jpeg";
      const extension = typeof fileExtension === "string" && /^[a-zA-Z0-9]{1,10}$/.test(fileExtension) ? fileExtension.toLowerCase() : contentType === "application/pdf" ? "pdf" : "jpg";
      const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "_") || "user";
      const safeDocType = String(docType).replace(/[^a-zA-Z0-9_-]/g, "_") || "document";
      const fileName = `${safeUserId}/${safeDocType}_${Date.now()}.${extension}`;
      const buffer = Buffer.from(base64Data, "base64");
      const uploadRes = await fetch(
        `${SUPABASE_URL2}/storage/v1/object/${BUCKET}/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": contentType,
            "x-upsert": "true"
          },
          body: buffer
        }
      );
      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("[upload-document] Supabase error:", err);
        return res.status(500).json({ message: `Supabase upload failed: ${err}` });
      }
      const url = `${SUPABASE_URL2}/storage/v1/object/public/${BUCKET}/${fileName}`;
      return res.json({ url });
    } catch (error) {
      console.error("[upload-document] error:", error.message);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/driver/documents", authOptional, async (req, res) => {
    const { applicationId, chauffeurId, type, url, userId: bodyUserId } = req.body;
    const userId = req.auth?.sub || bodyUserId;
    if (!type || !url) return res.status(400).json({ message: "type and url are required" });
    if (!userId) return res.status(400).json({ message: "userId required" });
    const doc = await storage.createDocument({
      userId,
      applicationId: applicationId || null,
      chauffeurId: chauffeurId || null,
      type,
      url,
      status: "pending"
    });
    return res.json(doc);
  });
  app2.get("/api/driver/documents", authOptional, async (req, res) => {
    const userId = req.auth?.sub || req.query.userId;
    if (!userId) return res.status(400).json({ message: "userId required" });
    const docs = await storage.getDocumentsByUser(userId);
    return res.json(docs);
  });
  app2.get(
    "/api/admin/documents",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      const docs = await storage.getAllDocuments();
      return res.json(docs);
    }
  );
  app2.get(
    "/api/admin/documents/user/:userId",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      const docs = await storage.getDocumentsByUser(req.params.userId);
      return res.json(docs);
    }
  );
  app2.put(
    "/api/admin/documents/:id",
    requireAuth,
    requireRole(["admin"]),
    async (req, res) => {
      const { status } = req.body;
      const doc = await storage.updateDocument(req.params.id, {
        status,
        reviewedAt: /* @__PURE__ */ new Date(),
        reviewerAdminId: req.auth.sub
      });
      if (!doc) return res.status(404).json({ message: "Document not found" });
      return res.json(doc);
    }
  );
  app2.post("/api/pricing/estimate", async (req, res) => {
    try {
      const { distanceKm, categoryId, isLateNight, pickupLat, pickupLng, durationMin } = req.body;
      const rideForDemand = {
        id: `estimate_${Date.now()}`,
        vehicleType: categoryId || "budget",
        pickupLat,
        pickupLng
      };
      const [activeRequests, eligibleDrivers] = await Promise.all([
        countActiveDemandForRide(rideForDemand),
        getEligibleChauffeursForRide(rideForDemand)
      ]);
      const surge = calculateSurgeMultiplier({
        activeRequests,
        eligibleDrivers: eligibleDrivers.length
      });
      const estimate = calculatePrice(distanceKm, categoryId || "budget", {
        isLateNight,
        surgeMultiplier: surge.multiplier,
        surgeReason: surge.reason,
        estimatedDurationMin: durationMin
      });
      return res.json(estimate);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/pricing/config", async (_req, res) => {
    return res.json(getPricingConfig());
  });
  app2.get("/api/pricing/categories", async (_req, res) => {
    return res.json(getVehicleCategories());
  });
  app2.put("/api/chauffeurs/:id/location", requireAuth, async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.id);
      if (!chauffeur || chauffeur.userId !== req.auth.sub) return res.status(403).json({ message: "Forbidden" });
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!isValidLocationSample(lat, lng)) return res.status(400).json({ message: "A valid latitude and longitude are required" });
      const updated = await storage.updateChauffeur(chauffeur.id, { lat, lng, locationUpdatedAt: /* @__PURE__ */ new Date() });
      const activeRide = (await storage.getRidesByChauffeur(chauffeur.id)).find(
        (ride) => ["chauffeur_assigned", "chauffeur_arriving", "chauffeur_arrived", "trip_started"].includes(ride.status)
      );
      if (activeRide) {
        const last = await pool2.query(
          "SELECT latitude, longitude FROM ride_location_samples WHERE ride_id = $1 ORDER BY recorded_at DESC LIMIT 1",
          [activeRide.id]
        );
        const previous = last.rows[0];
        const travelledKm = previous ? calculateHaversineDistanceKm(Number(previous.latitude), Number(previous.longitude), lat, lng) : 0;
        await pool2.query(
          "INSERT INTO ride_location_samples (ride_id, chauffeur_id, latitude, longitude) VALUES ($1, $2, $3, $4)",
          [activeRide.id, chauffeur.id, lat, lng]
        );
        if (travelledKm > 0 && travelledKm < 5) {
          await storage.updateRide(activeRide.id, { actualDistanceKm: Number(activeRide.actualDistanceKm || 0) + travelledKm });
        }
      }
      return res.json(updated);
    } catch (error) {
      return res.status(400).json({ message: error.message || "Unable to update location" });
    }
  });
  app2.post("/api/liveness/session", requireAuth, async (req, res) => {
    try {
      const provider = getLivenessProvider();
      const userId = req.auth.sub;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1e3);
      const challengeCode = buildChallengeCode();
      const existing = await storage.getLatestPendingLivenessSessionByUser(userId);
      if (existing && existing.expiresAt && new Date(existing.expiresAt).getTime() > Date.now()) {
        return res.json({
          sessionId: existing.id,
          provider: existing.provider,
          expiresAt: existing.expiresAt,
          challenge: challengeLabel(existing.challengeCode),
          maxAttempts: existing.maxAttempts,
          attempts: existing.attempts
        });
      }
      const session = await storage.createLivenessSession({
        userId,
        provider,
        status: "pending",
        challengeCode,
        maxAttempts: 3,
        attempts: 0,
        expiresAt
      });
      return res.json({
        sessionId: session.id,
        provider: session.provider,
        expiresAt: session.expiresAt,
        challenge: challengeLabel(session.challengeCode),
        maxAttempts: session.maxAttempts,
        attempts: session.attempts
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Failed to create liveness session" });
    }
  });
  app2.post("/api/liveness/verify", requireAuth, async (req, res) => {
    try {
      const { sessionId, selfieUrl, faceData, challenge } = req.body;
      if (!sessionId || !selfieUrl) {
        return res.status(400).json({ message: "sessionId and selfieUrl are required" });
      }
      const session = await storage.getLivenessSession(sessionId);
      if (!session || session.userId !== req.auth.sub) {
        return res.status(404).json({ message: "Liveness session not found" });
      }
      if (session.status === "passed") {
        return res.json({
          passed: true,
          sessionId: session.id,
          score: session.score || 0.99,
          provider: session.provider,
          selfieUrl: session.selfieUrl || selfieUrl
        });
      }
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await storage.updateLivenessSession(session.id, {
          status: "expired",
          errorReason: "Session expired. Please retry liveness."
        });
        return res.status(410).json({ message: "Session expired. Please retry liveness." });
      }
      const nextAttempts = (session.attempts || 0) + 1;
      if (nextAttempts > (session.maxAttempts || 3)) {
        await storage.updateLivenessSession(session.id, {
          status: "failed",
          attempts: nextAttempts,
          errorReason: "Maximum attempts reached"
        });
        return res.status(429).json({ message: "Maximum liveness attempts reached" });
      }
      if (session.provider !== "mock") {
        await storage.updateLivenessSession(session.id, {
          attempts: nextAttempts,
          selfieUrl,
          errorReason: "Provider integration pending"
        });
        return res.status(501).json({
          message: "Selected liveness provider is not configured yet. Switch LIVENESS_PROVIDER=mock for now."
        });
      }
      const qualityResult = await runMockSelfieQualityCheck(selfieUrl, faceData || null, challenge || session.challengeCode || null);
      const passed = qualityResult.passed;
      const score = qualityResult.score;
      const status = passed ? "passed" : "failed";
      const updated = await storage.updateLivenessSession(session.id, {
        attempts: nextAttempts,
        selfieUrl,
        score,
        status,
        verifiedAt: passed ? /* @__PURE__ */ new Date() : null,
        errorReason: passed ? null : qualityResult.reason || "Selfie quality check failed"
      });
      return res.json({
        passed,
        sessionId: updated?.id || session.id,
        score,
        provider: session.provider,
        selfieUrl,
        reason: passed ? null : qualityResult.reason || "Selfie quality check failed"
      });
    } catch (error) {
      return res.status(500).json({ message: error.message || "Liveness verification failed" });
    }
  });
  app2.post("/api/rides", requireAuth, async (req, res) => {
    try {
      const { distanceKm, isLateNight, ...rideData } = req.body;
      const clientId = req.auth.sub;
      rideData.clientId = clientId;
      let clientUser = await storage.getUser(clientId);
      if (!clientUser) {
        const { email, name, role } = req.auth;
        const placeholderEmail = email || `oauth_${clientId.slice(0, 12)}@a2blift.placeholder`;
        const existingByEmail = email ? await storage.getUserByUsername(email) : null;
        if (existingByEmail) {
          clientUser = existingByEmail;
        } else {
          try {
            const randomPw = await import_bcryptjs.default.hash(Math.random().toString(36), 10);
            clientUser = await storage.createUser({
              id: clientId,
              username: placeholderEmail,
              password: randomPw,
              name: name || "A2B LIFT",
              phone: null,
              role: role || "client"
            });
          } catch (_createErr) {
            clientUser = await storage.getUser(clientId);
            if (!clientUser) {
              return res.status(401).json({ success: false, message: "Session expired. Please log out and log in again." });
            }
          }
        }
      } else {
        const claimedName = typeof req.auth.name === "string" ? req.auth.name.trim() : "";
        const storedName = typeof clientUser.name === "string" ? clientUser.name.trim() : "";
        if (claimedName && getUserFirstName({ name: storedName }, "") !== getUserFirstName({ name: claimedName }, "")) {
          const normalizedStoredName = storedName.toLowerCase();
          const storedLooksGeneric = ["", "client", "rider"].includes(normalizedStoredName) || normalizedStoredName.startsWith("a2b ") && normalizedStoredName.endsWith("client");
          if (storedLooksGeneric) {
            clientUser = await storage.updateUser(clientUser.id, { name: claimedName });
          }
        }
      }
      const categoryId = rideData.vehicleType || "budget";
      const normalizedDistanceKm = Number(rideData.selectedRouteDistanceKm ?? distanceKm ?? 10);
      const safeDistanceKm = Number.isFinite(normalizedDistanceKm) && normalizedDistanceKm > 0 ? normalizedDistanceKm : 10;
      const normalizedDurationMin = Number(rideData.durationMin ?? 0);
      const safeDurationMin = Number.isFinite(normalizedDurationMin) && normalizedDurationMin > 0 ? normalizedDurationMin : null;
      const selectedRouteId = typeof rideData.selectedRouteId === "string" && rideData.selectedRouteId.trim() ? rideData.selectedRouteId.trim() : null;
      const rideForDemand = {
        id: `new_${Date.now()}`,
        vehicleType: categoryId,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng
      };
      const [activeRequests, eligibleDrivers] = await Promise.all([
        countActiveDemandForRide(rideForDemand),
        getEligibleChauffeursForRide(rideForDemand)
      ]);
      const surge = calculateSurgeMultiplier({
        activeRequests,
        eligibleDrivers: eligibleDrivers.length
      });
      const priceEstimate = calculatePrice(safeDistanceKm, categoryId, {
        isLateNight,
        surgeMultiplier: surge.multiplier,
        surgeReason: surge.reason,
        estimatedDurationMin: safeDurationMin
      });
      const safeFare = priceEstimate.totalPrice;
      const routeCurrency = typeof rideData.routeCurrency === "string" && rideData.routeCurrency.trim() ? rideData.routeCurrency.trim().toUpperCase() : priceEstimate.currency;
      const paymentMethod = rideData.paymentMethod || "cash";
      let scheduledFor = null;
      if (rideData.scheduledFor) {
        const parsed = new Date(rideData.scheduledFor);
        const minLeadMs = 25 * 60 * 1e3;
        const maxLeadMs = 30 * 24 * 60 * 60 * 1e3;
        if (!Number.isFinite(parsed.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid reservation time." });
        }
        if (parsed.getTime() < Date.now() + minLeadMs) {
          return res.status(400).json({ success: false, message: "Reservations must be at least 30 minutes in advance." });
        }
        if (parsed.getTime() > Date.now() + maxLeadMs) {
          return res.status(400).json({ success: false, message: "Reservations can be at most 30 days in advance." });
        }
        if (paymentMethod !== "card") {
          return res.status(400).json({ success: false, message: "Reservations must be paid by card." });
        }
        scheduledFor = parsed;
      }
      const livenessVerifiedAt = rideData.livenessStatus === "passed" ? /* @__PURE__ */ new Date() : void 0;
      const ride = await storage.createRide({
        clientId,
        pickupLat: rideData.pickupLat,
        pickupLng: rideData.pickupLng,
        pickupAddress: rideData.pickupAddress || null,
        dropoffLat: rideData.dropoffLat,
        dropoffLng: rideData.dropoffLng,
        dropoffAddress: rideData.dropoffAddress || null,
        vehicleType: rideData.vehicleType || "budget",
        paymentMethod: rideData.paymentMethod || "cash",
        price: safeFare,
        distanceKm: safeDistanceKm,
        durationMin: safeDurationMin,
        estimatedDurationMin: safeDurationMin,
        pricePerKm: priceEstimate.pricePerKm,
        baseFare: priceEstimate.baseFare,
        surgeMultiplier: priceEstimate.surgeMultiplier,
        surgeReason: priceEstimate.surgeReason,
        status: scheduledFor ? "reserved" : "searching",
        ...scheduledFor ? { scheduledFor } : {},
        paymentStatus: paymentMethod === "cash" ? "unpaid" : rideData.paymentStatus || "pending",
        cashSelfieUrl: rideData.cashSelfieUrl || null,
        livenessStatus: rideData.livenessStatus || "not_required",
        livenessProvider: rideData.livenessProvider || null,
        livenessSessionId: rideData.livenessSessionId || null,
        livenessScore: rideData.livenessScore || null,
        selectedRouteId,
        selectedRouteDistanceKm: selectedRouteId ? safeDistanceKm : null,
        actualFare: selectedRouteId ? safeFare : null,
        routeCurrency,
        routeSelectedAt: selectedRouteId ? /* @__PURE__ */ new Date() : null,
        ...livenessVerifiedAt ? { livenessVerifiedAt } : {}
      });
      let clientFirstName = "Rider";
      try {
        const clientUser2 = await storage.getUser(clientId);
        clientFirstName = getUserFirstName(clientUser2, "Rider");
      } catch {
      }
      const enrichedRide = { ...ride, clientFirstName };
      if (scheduledFor) {
        return res.json({
          success: true,
          status: "reserved",
          message: `Ride reserved for ${scheduledFor.toISOString()}. We'll find your driver closer to the time.`,
          ride: enrichedRide
        });
      }
      const dispatch = await dispatchNextRideOffer(enrichedRide);
      return res.json({
        success: true,
        status: dispatch.ride?.status || ride.status,
        message: dispatch.offered ? "Offering your trip to the nearest matching driver..." : "Searching for drivers...",
        firstMatchedDriverId: dispatch.offered?.id || null,
        currentOfferExpiresAt: dispatch.ride?.currentOfferExpiresAt || null,
        ride: dispatch.ride || ride
      });
    } catch (error) {
      console.error("Ride creation error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create ride request"
      });
    }
  });
  app2.post(
    "/api/paystack/initialize",
    requireAuth,
    async (req, res) => {
      try {
        const { rideId } = req.body;
        if (!rideId) {
          return res.status(400).json({ message: "rideId is required" });
        }
        const ride = await storage.getRide(rideId);
        if (!ride) {
          return res.status(404).json({ message: "Ride not found" });
        }
        if (!ride.price || ride.price <= 0) {
          return res.status(400).json({ message: "Ride does not have a valid price" });
        }
        const user = await storage.getUser(req.auth.sub);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
        const { secret, currency } = getPaystackConfig();
        const rideReference = `A2B-RIDE-${Date.now()}-${user.id.slice(0, 6)}`;
        const domain = getAppBaseUrl(req);
        const rideCallbackUrl = `${domain}/api/payments/webview-callback?reference=${rideReference}`;
        const amountInMinorUnits = Math.round(ride.price * 100);
        const email = user.username.includes("@") ? user.username : `${user.username}@example.com`;
        const initBody = {
          email,
          amount: amountInMinorUnits,
          currency,
          reference: rideReference,
          callback_url: rideCallbackUrl,
          metadata: {
            rideId: ride.id,
            userId: user.id
          }
        };
        const response = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${secret}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(initBody)
          }
        );
        const data = await response.json();
        if (!response.ok || !data?.status) {
          return res.status(502).json({ message: "Failed to initialize Paystack", raw: data });
        }
        return res.json({
          authorizationUrl: data.data.authorization_url,
          reference: data.data.reference
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("PAYSTACK")) {
          return res.status(500).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message || "Server error" });
      }
    }
  );
  app2.post("/api/paystack/webhook", async (req, res) => {
    try {
      const signature = req.header("x-paystack-signature");
      if (!signature) {
        return res.status(400).json({ message: "Missing signature" });
      }
      let secret;
      try {
        secret = getPaystackConfig().secret;
      } catch (e) {
        console.error("Paystack webhook misconfigured:", e);
        return res.status(500).json({ message: "Paystack not configured" });
      }
      const rawBody = req.rawBody;
      const raw = typeof rawBody === "string" ? rawBody : Buffer.isBuffer(rawBody) ? rawBody : JSON.stringify(req.body);
      const hash = import_node_crypto.default.createHmac("sha512", secret).update(raw).digest("hex");
      if (hash !== signature) {
        console.warn("Invalid Paystack webhook signature");
        return res.status(401).json({ message: "Invalid signature" });
      }
      const payload = req.body;
      if (payload?.event !== "charge.success") {
        return res.status(200).json({ received: true });
      }
      const eventData = payload.data || {};
      const metadata = eventData.metadata || {};
      const rideId = metadata.rideId;
      const userId = metadata.userId ?? void 0;
      if (!rideId) {
        return res.status(200).json({ received: true, message: "No rideId in metadata" });
      }
      const amountMinor = eventData.amount;
      const amount = typeof amountMinor === "number" ? amountMinor / 100 : 0;
      try {
        const ride = await storage.getRide(rideId);
        if (!ride) {
          console.warn("Paystack webhook for unknown ride:", rideId);
          return res.status(200).json({ received: true });
        }
        const finalAmount = amount || ride.price || 0;
        await storage.createPayment({
          rideId: ride.id,
          payerUserId: userId || ride.clientId,
          amount: finalAmount,
          method: "paystack",
          status: "paid",
          provider: "paystack",
          providerRef: eventData.reference
        });
        await storage.updateRide(ride.id, {
          paymentStatus: "paid",
          paymentMethod: "card"
        });
        if (ride.chauffeurId && finalAmount > 0) {
          try {
            const earningsCalc = calculateChauffeurEarnings(finalAmount);
            const existing = await storage.getEarningsByChauffeur(ride.chauffeurId);
            const alreadyRecorded = existing.some((e) => e.rideId === ride.id);
            if (!alreadyRecorded) {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: "card"
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings
                });
              }
            }
          } catch (earningsErr) {
            console.error("Webhook earnings record failed (non-fatal):", earningsErr.message);
          }
        }
      } catch (dbError) {
        console.error("Error applying Paystack payment:", dbError);
        return res.status(200).json({ received: true, error: "db_error" });
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Paystack webhook error:", error);
      return res.status(500).json({ message: "Webhook processing failed" });
    }
  });
  app2.get("/api/rides/:id", async (req, res) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      return res.json({ ...ride, clientFirstName });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id", async (req, res) => {
    try {
      const ride = await storage.updateRide(req.params.id, req.body);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      const rideWithClientName = { ...ride, clientFirstName };
      io.emit("ride:statusUpdate", rideWithClientName);
      return res.json(rideWithClientName);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id/accept", requireAuth, async (req, res) => {
    try {
      const { chauffeurId } = req.body;
      if (!chauffeurId) return res.status(400).json({ message: "chauffeurId is required" });
      const chauffeur = await storage.getChauffeur(chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth.sub) {
        return res.status(403).json({ message: "Forbidden: chauffeur mismatch" });
      }
      const rideToAccept = await storage.getRide(req.params.id);
      if (!rideToAccept) return res.status(404).json({ message: "Ride not found" });
      if (!isRideOfferActive(rideToAccept, chauffeurId)) {
        return res.status(409).json({ message: "Ride offer expired or is no longer assigned to this driver" });
      }
      const activeVehicle = await getApprovedActiveVehicle(chauffeur);
      if (!activeVehicle || !isVehicleEligibleForRide(rideToAccept.vehicleType || "budget", activeVehicle.vehicleType)) {
        return res.status(403).json({ message: "Your active approved vehicle does not match this ride category." });
      }
      const updated = await storage.acceptRideAtomic(req.params.id, chauffeurId, activeVehicle.id || null);
      if (!updated) {
        return res.status(409).json({ message: "Ride already assigned to another driver" });
      }
      const timer = dispatchTimers.get(updated.id);
      if (timer) clearTimeout(timer);
      dispatchTimers.delete(updated.id);
      skippedChauffeursByRide.delete(updated.id);
      let clientFirstName = "Rider";
      try {
        const client = await storage.getUser(updated.clientId);
        clientFirstName = getUserFirstName(client, "Rider");
      } catch {
      }
      const enrichedAccepted = { ...updated, clientFirstName };
      io.emit("ride:accepted", enrichedAccepted);
      if (updated.clientId) {
        await storage.createNotification({
          userId: updated.clientId,
          title: "Driver Assigned",
          body: "Your premium chauffeur has been assigned and is on the way.",
          type: "ride"
        });
        const riderUser = await storage.getUser(updated.clientId);
        if (riderUser?.pushToken) {
          sendExpoPushNotification(
            [riderUser.pushToken],
            "\u{1F698} Driver Assigned",
            "Your premium chauffeur has been assigned and is on the way.",
            { rideId: updated.id, type: "ride:accepted" },
            { urgent: true, channelId: "client-alerts" }
          );
        }
      }
      await storage.createNotification({
        userId: chauffeur.userId,
        title: "Ride Accepted",
        body: "You're on your way to pick up the client. Head to the pickup location.",
        type: "ride"
      });
      if (chauffeur.pushToken) {
        sendExpoPushNotification(
          [chauffeur.pushToken],
          "\u{1F697} Going to Pick Up",
          "You've accepted the ride. Head to the pickup location now.",
          { rideId: updated.id, type: "ride:accepted" }
        );
      }
      return res.json(enrichedAccepted);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/rides/:id/status", requireAuth, async (req, res) => {
    try {
      const { status } = req.body;
      const existingRide = await storage.getRide(req.params.id);
      if (!existingRide) return res.status(404).json({ message: "Ride not found" });
      const callerUser = await storage.getUser(req.auth.sub);
      if (!callerUser) return res.status(403).json({ message: "Forbidden" });
      const isRider = existingRide.clientId === callerUser.id;
      let isChauffeur = false;
      if (existingRide.chauffeurId) {
        const ch = await storage.getChauffeur(existingRide.chauffeurId);
        isChauffeur = ch?.userId === callerUser.id;
      }
      const isAdmin = callerUser.role === "admin";
      if (!isRider && !isChauffeur && !isAdmin) {
        return res.status(403).json({ message: "Forbidden: not a party to this ride" });
      }
      const now = /* @__PURE__ */ new Date();
      const cancelledBy = status === "cancelled" ? isRider ? "client" : isChauffeur ? "driver" : "admin" : void 0;
      const rideBeforeUpdate = status === "cancelled" ? existingRide : null;
      const updateData = {
        status
      };
      if (status === "trip_started") {
        updateData.tripStartedAt = existingRide.tripStartedAt || now;
      }
      if (status === "trip_completed") {
        const actualDurationFromBody = Number(req.body?.actualDurationMin);
        const actualDurationMin = Number.isFinite(actualDurationFromBody) && actualDurationFromBody > 0 ? actualDurationFromBody : existingRide.tripStartedAt ? Math.max(0, (now.getTime() - new Date(existingRide.tripStartedAt).getTime()) / 6e4) : existingRide.acceptedAt ? Math.max(0, (now.getTime() - new Date(existingRide.acceptedAt).getTime()) / 6e4) : Number(existingRide.durationMin || 0);
        const minuteAdjustment = calculatePerMinuteAdjustment(
          existingRide.estimatedDurationMin ?? existingRide.durationMin,
          actualDurationMin
        );
        const previousAdjustment = Number(existingRide.perMinuteAdjustment || 0);
        const additionalAdjustment = Math.max(0, minuteAdjustment.adjustmentAmount - previousAdjustment);
        updateData.completedAt = now;
        updateData.actualDurationMin = Math.round(actualDurationMin * 10) / 10;
        updateData.perMinuteAdjustment = minuteAdjustment.adjustmentAmount;
        updateData.price = Math.round((Number(existingRide.price || 0) + additionalAdjustment) * 100) / 100;
      }
      if (status === "cancelled") {
        const isReservation = existingRide.scheduledFor && existingRide.status === "reserved";
        if (isReservation && cancelledBy === "client" && existingRide.paymentStatus === "paid") {
          updateData.cancellationFee = Math.round(Number(existingRide.price || 0) * RESERVATION_CANCELLATION_FEE_RATE * 100) / 100;
        } else if (isReservation) {
          updateData.cancellationFee = 0;
        } else {
          const cancellation = calculateCancellationFee(
            existingRide.vehicleType || "budget",
            existingRide.acceptedAt,
            now,
            cancelledBy
          );
          updateData.cancellationFee = cancellation.fee;
        }
        updateData.cancelledBy = cancelledBy;
        updateData.currentOfferedChauffeurId = null;
        updateData.currentOfferExpiresAt = null;
      }
      const ride = await storage.updateRide(req.params.id, updateData);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (status === "cancelled" || status === "trip_completed") {
        const timer = dispatchTimers.get(ride.id);
        if (timer) clearTimeout(timer);
        dispatchTimers.delete(ride.id);
        skippedChauffeursByRide.delete(ride.id);
      }
      if (status === "cancelled" && rideBeforeUpdate) {
        try {
          const payments2 = await storage.getPaymentsByRide(req.params.id);
          const cancellationFee = Math.max(0, Number(ride.cancellationFee || 0));
          const grossRidePrice = Math.max(0, Number(rideBeforeUpdate.price || 0));
          const refundableAmount = Math.max(0, grossRidePrice - cancellationFee);
          const feeMessage = cancellationFee > 0 ? `A cancellation fee of R${cancellationFee.toFixed(2)} was applied.` : "No charges were applied.";
          const cardPayment = payments2.find(
            (p) => p.method === "card" && p.status === "paid" && p.paystackReference
          );
          if (cardPayment?.paystackReference) {
            const secret = process.env.PAYSTACK_SECRET_KEY || "";
            if (refundableAmount > 0) {
              await import_axios.default.post(
                "https://api.paystack.co/refund",
                {
                  transaction: cardPayment.paystackReference,
                  amount: Math.round(refundableAmount * 100)
                },
                { headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } }
              );
            }
            await storage.updatePayment(cardPayment.id, { status: cancellationFee > 0 ? "partially_refunded" : "refunded" });
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. ${feeMessage}${refundableAmount > 0 ? ` R${refundableAmount.toFixed(2)} has been refunded to your card.` : ""}`,
                type: "payment"
              });
              if (rider?.pushToken) {
                sendExpoPushNotification(
                  [rider.pushToken],
                  "Refund Issued",
                  `Your ride was cancelled. ${feeMessage}`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" }
                );
              }
            }
          }
          const walletPayment = !cardPayment ? payments2.find((p) => p.method === "wallet" && p.status === "paid") : null;
          if (walletPayment) {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider) {
              const amt = refundableAmount;
              const balanceBefore = rider.walletBalance || 0;
              const newBalance = balanceBefore + amt;
              if (amt > 0) {
                await storage.updateUser(rider.id, { walletBalance: newBalance });
                await storage.createWalletTransaction({
                  userId: rider.id,
                  type: "refund",
                  amount: amt,
                  balanceBefore,
                  balanceAfter: newBalance,
                  reference: `wallet_refund_${ride.id}_${Date.now()}`,
                  description: cancellationFee > 0 ? "Ride cancelled \u2014 remaining wallet balance restored after cancellation fee" : "Ride cancelled \u2014 wallet balance restored",
                  rideId: ride.id,
                  status: "completed"
                });
              }
              await storage.updatePayment(walletPayment.id, { status: cancellationFee > 0 ? "partially_refunded" : "refunded" });
              await storage.createNotification({
                userId: rider.id,
                title: "Refund Issued",
                body: `Your ride was cancelled. ${feeMessage}${amt > 0 ? ` R${amt.toFixed(2)} has been returned to your A2B wallet.` : ""}`,
                type: "payment"
              });
              if (rider?.pushToken) {
                sendExpoPushNotification(
                  [rider.pushToken],
                  "Refund Issued",
                  `Your ride was cancelled. ${feeMessage}`,
                  { rideId: ride.id, type: "ride:cancelled" },
                  { urgent: true, channelId: "client-alerts" }
                );
              }
            }
          }
          const paymentMethod = rideBeforeUpdate.paymentMethod || "cash";
          if (!cardPayment && !walletPayment && paymentMethod === "cash") {
            const rider = await storage.getUser(rideBeforeUpdate.clientId);
            if (rider && cancellationFee > 0) {
              const balanceBefore = rider.walletBalance || 0;
              const balanceAfter = balanceBefore - cancellationFee;
              await storage.updateUser(rider.id, { walletBalance: balanceAfter });
              await storage.createWalletTransaction({
                userId: rider.id,
                type: "cancellation_fee",
                amount: cancellationFee,
                balanceBefore,
                balanceAfter,
                reference: `cash_cancel_fee_${ride.id}_${Date.now()}`,
                description: "Cash ride cancellation fee",
                rideId: ride.id,
                status: "completed"
              });
            }
            await storage.createNotification({
              userId: rideBeforeUpdate.clientId,
              title: "Ride Cancelled",
              body: `Your ride has been cancelled. ${feeMessage}`,
              type: "ride"
            });
            if (rider?.pushToken) {
              sendExpoPushNotification(
                [rider.pushToken],
                "Ride Cancelled",
                `Your ride was cancelled. ${feeMessage}`,
                { rideId: ride.id, type: "ride:cancelled" },
                { urgent: true, channelId: "client-alerts" }
              );
            }
          }
          if (rideBeforeUpdate.chauffeurId) {
            const chauffeur = await storage.getChauffeur(rideBeforeUpdate.chauffeurId);
            if (chauffeur?.userId) {
              await storage.createNotification({
                userId: chauffeur.userId,
                title: "Ride Cancelled",
                body: "The client has cancelled this trip.",
                type: "ride"
              });
            }
            if (chauffeur?.pushToken) {
              sendExpoPushNotification(
                [chauffeur.pushToken],
                "Ride Cancelled",
                "The client has cancelled this trip."
              );
            }
          }
        } catch (refundErr) {
          console.error("Cancellation refund/notification failed (non-fatal):", refundErr.message);
        }
      }
      if (status === "trip_completed" && ride.chauffeurId && ride.price) {
        try {
          const earningsCalc = calculateChauffeurEarnings(ride.price);
          const existingEarnings = await storage.getEarningsByChauffeur(ride.chauffeurId);
          const alreadyRecorded = existingEarnings.some((e) => e.rideId === ride.id);
          const paymentMethod = ride.paymentMethod || "cash";
          if (!alreadyRecorded) {
            if (paymentMethod === "cash") {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: -earningsCalc.commission,
                commission: earningsCalc.commission,
                type: "cash"
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) - earningsCalc.commission
                });
              }
            } else {
              await storage.createEarning({
                chauffeurId: ride.chauffeurId,
                rideId: ride.id,
                amount: earningsCalc.chauffeurEarnings,
                commission: earningsCalc.commission,
                type: paymentMethod
              });
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur) {
                await storage.updateChauffeur(ride.chauffeurId, {
                  earningsTotal: (chauffeur.earningsTotal || 0) + earningsCalc.chauffeurEarnings
                });
              }
            }
          }
        } catch (earningsErr) {
          console.error("earnings record failed (non-fatal):", earningsErr.message);
        }
        try {
          const completingChauffeur = await storage.getChauffeur(ride.chauffeurId);
          if (completingChauffeur?.userId) {
            await creditReferralReward({
              referredUserId: completingChauffeur.userId,
              sourceUserId: completingChauffeur.userId,
              rideId: ride.id,
              grossFare: ride.price,
              type: "driver_referral_commission",
              description: "2.5% reward programme earning from a trip completed by a driver you invited",
              notificationBody: "You earned R {amount} \u2014 2.5% from a trip completed by a driver you invited.",
              referencePrefix: "drv_ref"
            });
          }
          if (ride.clientId) {
            await creditReferralReward({
              riderUserId: ride.clientId,
              sourceUserId: ride.clientId,
              rideId: ride.id,
              grossFare: ride.price,
              type: "rider_referral_commission",
              description: "2.5% reward programme earning from a trip completed by a rider you invited",
              notificationBody: "You earned R {amount} \u2014 2.5% from a trip completed by a rider you invited.",
              referencePrefix: "rdr_ref"
            });
          }
        } catch (referralCommErr) {
          console.error("referral commission failed (non-fatal):", referralCommErr.message);
        }
        try {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Completed",
            body: `Your trip has been completed. Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "Trip Completed",
              `Fare: R ${ride.price}. Thank you for choosing A2B LIFT.`,
              { rideId: ride.id, type: "ride:completed" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        } catch (notifErr) {
          console.error("notification failed (non-fatal):", notifErr.message);
        }
        try {
          const paymentMethod = ride.paymentMethod || "cash";
          if (paymentMethod === "cash") {
            const existingPayments = await storage.getPaymentsByRide(ride.id);
            if (existingPayments.length === 0) {
              await storage.createPayment({
                rideId: ride.id,
                payerUserId: ride.clientId,
                amount: ride.price,
                method: "cash",
                status: "paid",
                provider: "cash",
                providerRef: `cash_${ride.id}_${Date.now()}`
              });
              await storage.updateRide(ride.id, { paymentStatus: "paid", paymentMethod: "cash" });
            } else {
              const pendingPayment = existingPayments.find((p) => p.status === "pending" && p.method === "cash");
              if (pendingPayment) {
                await storage.updatePayment(pendingPayment.id, { status: "paid" });
                await storage.updateRide(ride.id, { paymentStatus: "paid" });
              }
            }
          }
        } catch (payErr) {
          console.error("payment record failed (non-fatal):", payErr.message);
        }
      }
      let clientFirstName = "Client";
      try {
        const client = await storage.getUser(ride.clientId);
        clientFirstName = getUserFirstName(client, "Client");
      } catch {
      }
      const rideWithClientName = { ...ride, clientFirstName };
      io.emit("ride:statusUpdate", rideWithClientName);
      try {
        if (status === "chauffeur_arriving" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Driver Arriving",
            body: "Your chauffeur is arriving at your pickup location. Please be ready.",
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "\u{1F697} Driver Arriving",
              "Your chauffeur is arriving at your pickup. Please be ready!",
              { rideId: ride.id, type: "ride:arriving" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        } else if (status === "trip_started" && ride.clientId) {
          await storage.createNotification({
            userId: ride.clientId,
            title: "Trip Started",
            body: `Your trip is underway to ${ride.dropoffAddress || "your destination"}.`,
            type: "ride"
          });
          const riderUser = await storage.getUser(ride.clientId);
          if (riderUser?.pushToken) {
            sendExpoPushNotification(
              [riderUser.pushToken],
              "\u{1F680} Trip Started",
              `Your ride is underway to ${ride.dropoffAddress || "your destination"}.`,
              { rideId: ride.id, type: "ride:started" },
              { urgent: true, channelId: "client-alerts" }
            );
          }
        }
      } catch (notifErr) {
        console.error("rider status notification failed (non-fatal):", notifErr.message);
      }
      return res.json(rideWithClientName);
    } catch (error) {
      console.error("ride status update error:", error.message, error.stack);
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/rides/:id/pay", requireAuth, async (req, res) => {
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth.sub) return res.status(403).json({ message: "Forbidden" });
    const amount = ride.price || 0;
    const method = req.body?.method || ride.paymentMethod || "cash";
    const payment = await storage.createPayment({
      rideId: ride.id,
      payerUserId: req.auth.sub,
      amount,
      method,
      status: method === "cash" ? "pending" : "paid"
    });
    await storage.updateRide(ride.id, {
      paymentStatus: payment.status === "paid" ? "paid" : "pending",
      paymentMethod: method
    });
    return res.json({ payment });
  });
  app2.post("/api/rides/:id/rate", requireAuth, async (req, res) => {
    const { rating, comment } = req.body;
    const ride = await storage.getRide(req.params.id);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.clientId !== req.auth.sub) return res.status(403).json({ message: "Forbidden" });
    if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
    if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });
    const rr = await storage.createRideRating({
      rideId: ride.id,
      clientId: ride.clientId,
      chauffeurId: ride.chauffeurId,
      rating,
      comment: comment || null
    });
    const chauffeur = await storage.getChauffeur(ride.chauffeurId);
    if (chauffeur) {
      const avgRating = await storage.getAverageRatingForUser(chauffeur.userId);
      if (avgRating != null) {
        await storage.updateUser(chauffeur.userId, { rating: avgRating });
      }
    }
    return res.json(rr);
  });
  app2.post("/api/rides/:id/rate-client", requireAuth, async (req, res) => {
    try {
      await ensureClientRatingsTable();
      const { rating, comment } = req.body;
      const numericRating = Number(rating);
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
      }
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      if (!ride.chauffeurId) return res.status(400).json({ message: "Ride has no chauffeur" });
      if (ride.status !== "trip_completed") return res.status(400).json({ message: "Ride not completed" });
      const chauffeur = await storage.getChauffeur(ride.chauffeurId);
      if (!chauffeur || chauffeur.userId !== req.auth.sub) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await pool2.query(
        `
          INSERT INTO client_ratings (ride_id, client_id, chauffeur_id, rating, comment)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (ride_id, chauffeur_id)
          DO UPDATE SET
            rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            created_at = now()
          RETURNING
            id,
            ride_id AS "rideId",
            client_id AS "clientId",
            chauffeur_id AS "chauffeurId",
            rating,
            comment,
            created_at AS "createdAt"
        `,
        [ride.id, ride.clientId, ride.chauffeurId, numericRating, comment || null]
      );
      const averageResult = await pool2.query(
        `SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating FROM client_ratings WHERE client_id = $1`,
        [ride.clientId]
      );
      const average = averageResult.rows[0]?.avg_rating != null ? Number(averageResult.rows[0].avg_rating) : null;
      if (average != null) {
        await storage.updateUser(ride.clientId, { rating: average });
      }
      return res.json(result.rows[0]);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/client/:clientId", async (req, res) => {
    try {
      const ridesList = await storage.getRidesByClient(req.params.clientId);
      return res.json(ridesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const ridesList = await storage.getRidesByChauffeur(req.params.chauffeurId);
      return res.json(ridesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/available/:chauffeurId", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.json([]);
      }
      const activeVehicle = await getApprovedActiveVehicle(chauffeur);
      if (!activeVehicle) return res.json([]);
      const allRides = await storage.getAllRides();
      const searching = allRides.filter(
        (r) => r.status === "searching" && isRideOfferActive(r, chauffeur.id) && isVehicleEligibleForRide(r.vehicleType || "budget", activeVehicle.vehicleType)
      );
      if (!searching.length) return res.json([]);
      let candidates = searching;
      if (chauffeur.lat && chauffeur.lng) {
        candidates = searching.map((r) => ({
          ...r,
          distKm: calculateHaversineDistanceKm(
            Number(chauffeur.lat),
            Number(chauffeur.lng),
            parseFloat(r.pickupLat),
            parseFloat(r.pickupLng)
          )
        })).filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM).sort((a, b) => a.distKm - b.distKm);
      }
      const enriched = await Promise.all(
        candidates.slice(0, 10).map(async (r) => {
          try {
            const client = await storage.getUser(r.clientId);
            const firstName = getUserFirstName(client, "Rider");
            return { ...r, clientFirstName: firstName };
          } catch {
            return { ...r, clientFirstName: "Rider" };
          }
        })
      );
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides/chauffeur-pending/:chauffeurId", async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeur(req.params.chauffeurId);
      if (!chauffeur || !chauffeur.isOnline || !chauffeur.isApproved) {
        return res.status(204).end();
      }
      const activeVehicle = await getApprovedActiveVehicle(chauffeur);
      if (!activeVehicle) return res.status(204).end();
      const allRides = await storage.getAllRides();
      const searching = allRides.filter(
        (r) => r.status === "searching" && isRideOfferActive(r, chauffeur.id) && isVehicleEligibleForRide(r.vehicleType || "budget", activeVehicle.vehicleType)
      );
      if (!searching.length) return res.status(204).end();
      async function enrichRide(r) {
        try {
          const client = await storage.getUser(r.clientId);
          const firstName = getUserFirstName(client, "Rider");
          return { ...r, clientFirstName: firstName };
        } catch {
          return { ...r, clientFirstName: "Rider" };
        }
      }
      if (hasFreshChauffeurLocation(chauffeur)) {
        const withDist = searching.map((r) => ({
          ...r,
          distKm: calculateHaversineDistanceKm(
            Number(chauffeur.lat),
            Number(chauffeur.lng),
            parseFloat(r.pickupLat),
            parseFloat(r.pickupLng)
          )
        })).filter((r) => r.distKm <= RIDE_MATCH_RADIUS_KM).sort((a, b) => a.distKm - b.distKm);
        if (!withDist.length) return res.status(204).end();
        return res.json(await enrichRide(withDist[0]));
      }
      return res.json(await enrichRide(searching[searching.length - 1]));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/rides", async (_req, res) => {
    try {
      const allRides = await storage.getAllRides();
      return res.json(allRides);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/earnings/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const earningsList = await storage.getEarningsByChauffeur(req.params.chauffeurId);
      return res.json(earningsList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/earnings/chauffeur/:chauffeurId/annual-share", async (req, res) => {
    try {
      const yearParam = Number(req.query.year);
      const year = Number.isFinite(yearParam) && yearParam > 2020 ? yearParam : (/* @__PURE__ */ new Date()).getFullYear();
      const [chauffeur, earningsList] = await Promise.all([
        storage.getChauffeur(req.params.chauffeurId),
        storage.getEarningsByChauffeur(req.params.chauffeurId)
      ]);
      const summary = summarizeAnnualDriverShare(earningsList, year);
      const createdAt = chauffeur?.createdAt ? new Date(chauffeur.createdAt).getTime() : Date.now();
      const activeMonths = Math.max(0, Math.floor((Date.now() - createdAt) / (1e3 * 60 * 60 * 24 * 30)));
      return res.json({
        ...summary,
        activeMonths,
        eligibleByAccountAge: activeMonths >= DRIVER_SHARE_MIN_ACTIVE_MONTHS,
        note: "Final December payout is subject to active driver status, consistent weekly trips, and service standards review."
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  async function refundWithdrawalHold(withdrawal) {
    const amount = Number(withdrawal?.amount || 0);
    if (!(amount > 0)) return;
    if (withdrawal.source === "wallet" && withdrawal.userId) {
      const user = await storage.getUser(withdrawal.userId);
      if (user) {
        const balanceBefore = Number(user.walletBalance || 0);
        await storage.updateUser(user.id, { walletBalance: balanceBefore + amount });
        await recordWalletTx(user.id, "refund", amount, balanceBefore, "Withdrawal request refunded");
      }
    } else if (withdrawal.chauffeurId) {
      const chauffeur = await storage.getChauffeur(withdrawal.chauffeurId);
      if (chauffeur) {
        await storage.updateChauffeur(chauffeur.id, {
          earningsTotal: Number(chauffeur.earningsTotal || 0) + amount
        });
      }
    }
  }
  async function getWithdrawalRequesterUserId(withdrawal) {
    if (withdrawal?.userId) return withdrawal.userId;
    if (withdrawal?.chauffeurId) {
      const chauffeur = await storage.getChauffeur(withdrawal.chauffeurId).catch(() => void 0);
      return chauffeur?.userId || null;
    }
    return null;
  }
  app2.post("/api/withdrawals", requireAuth, async (req, res) => {
    try {
      const amount = Math.round(Number(req.body?.amount) * 100) / 100;
      const bankName = String(req.body?.bankName || "").trim();
      const accountNumber = String(req.body?.accountNumber || "").trim();
      const accountHolder = String(req.body?.accountHolder || req.body?.accountName || "").trim();
      if (!Number.isFinite(amount) || amount < 50) {
        return res.status(400).json({ message: "Minimum withdrawal is R50." });
      }
      if (!bankName || !accountNumber || accountNumber.length < 6 || !accountHolder) {
        return res.status(400).json({ message: "Bank name, account number and account holder are required." });
      }
      const userId = req.auth.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const chauffeur = await storage.getChauffeurByUserId(userId).catch(() => void 0);
      let source;
      if (chauffeur && Number(chauffeur.earningsTotal || 0) >= amount) {
        source = "driver_earnings";
      } else if (Number(user.walletBalance || 0) >= amount) {
        source = "wallet";
      } else {
        const available = Math.max(Number(chauffeur?.earningsTotal || 0), Number(user.walletBalance || 0));
        return res.status(400).json({ message: `You only have R${available.toFixed(2)} available to withdraw.` });
      }
      if (source === "driver_earnings" && chauffeur) {
        await storage.updateChauffeur(chauffeur.id, {
          earningsTotal: Number(chauffeur.earningsTotal || 0) - amount
        });
      } else {
        const balanceBefore = Number(user.walletBalance || 0);
        await storage.updateUser(userId, { walletBalance: balanceBefore - amount });
        await recordWalletTx(userId, "withdrawal", amount, balanceBefore, "Withdrawal request (pending admin approval)");
      }
      const withdrawal = await storage.createWithdrawal({
        userId,
        chauffeurId: chauffeur?.id || null,
        source,
        amount,
        status: "pending",
        bankName,
        accountNumber,
        accountHolder
      });
      try {
        const admins = (await storage.getAllUsers() || []).filter((u) => u.role === "admin");
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            title: "New withdrawal request",
            body: `${user.name || user.username}: R${amount.toFixed(2)} to ${bankName} (${accountHolder}). Approve in the admin dashboard, then pay via EFT.`,
            type: "withdrawal"
          });
          if (admin.pushToken) {
            sendExpoPushNotification(
              [admin.pushToken],
              "New withdrawal request",
              `${user.name || user.username}: R${amount.toFixed(2)} to ${bankName}`,
              { type: "withdrawal", withdrawalId: withdrawal.id }
            );
          }
        }
      } catch {
      }
      return res.json({
        success: true,
        withdrawal,
        message: "Withdrawal request sent for admin approval. Once approved, you will be paid via EFT."
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/withdrawals/my", requireAuth, async (req, res) => {
    try {
      const userId = req.auth.sub;
      const chauffeur = await storage.getChauffeurByUserId(userId).catch(() => void 0);
      const all = await storage.getAllWithdrawals();
      const mine = (all || []).filter(
        (w) => w.userId === userId || chauffeur && w.chauffeurId === chauffeur.id
      );
      return res.json(mine);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/withdrawals/chauffeur/:chauffeurId", async (req, res) => {
    try {
      const withdrawalsList = await storage.getWithdrawalsByChauffeur(req.params.chauffeurId);
      return res.json(withdrawalsList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/withdrawals", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const allWithdrawals = await storage.getAllWithdrawals();
      const enriched = await Promise.all((allWithdrawals || []).map(async (w) => {
        try {
          const requesterUserId = await getWithdrawalRequesterUserId(w);
          const requester = requesterUserId ? await storage.getUser(requesterUserId) : null;
          return {
            ...w,
            requesterName: requester?.name || w.accountHolder || "\u2014",
            requesterEmail: requester?.username || "\u2014",
            requesterRole: w.chauffeurId ? "driver" : requester?.role || "client"
          };
        } catch {
          return { ...w, requesterName: w.accountHolder || "\u2014", requesterEmail: "\u2014", requesterRole: w.chauffeurId ? "driver" : "client" };
        }
      }));
      return res.json(enriched);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/withdrawals/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const existing = await storage.getWithdrawal(req.params.id);
      if (!existing) return res.status(404).json({ message: "Withdrawal not found" });
      const updates = {};
      for (const field of ["bankName", "accountNumber", "accountHolder"]) {
        if (typeof req.body?.[field] === "string" && req.body[field].trim()) {
          updates[field] = req.body[field].trim();
        }
      }
      if (req.body?.amount !== void 0) {
        const newAmount = Math.round(Number(req.body.amount) * 100) / 100;
        if (!Number.isFinite(newAmount) || newAmount < 1) {
          return res.status(400).json({ message: "Invalid amount." });
        }
        const delta = newAmount - Number(existing.amount || 0);
        if (delta !== 0 && ["pending", "approved"].includes(existing.status)) {
          if (existing.source === "wallet" && existing.userId) {
            const holder = await storage.getUser(existing.userId);
            if (holder) {
              const balanceBefore = Number(holder.walletBalance || 0);
              if (delta > 0 && balanceBefore < delta) {
                return res.status(400).json({ message: "User does not have enough wallet balance for the increased amount." });
              }
              await storage.updateUser(holder.id, { walletBalance: balanceBefore - delta });
              await recordWalletTx(holder.id, delta > 0 ? "withdrawal" : "refund", Math.abs(delta), balanceBefore, "Withdrawal amount adjusted by admin");
            }
          } else if (existing.chauffeurId) {
            const chauffeur = await storage.getChauffeur(existing.chauffeurId);
            if (chauffeur) {
              if (delta > 0 && Number(chauffeur.earningsTotal || 0) < delta) {
                return res.status(400).json({ message: "Driver does not have enough earnings for the increased amount." });
              }
              await storage.updateChauffeur(chauffeur.id, {
                earningsTotal: Number(chauffeur.earningsTotal || 0) - delta
              });
            }
          }
        }
        updates.amount = newAmount;
      }
      const nextStatus = typeof req.body?.status === "string" ? req.body.status : null;
      if (nextStatus && nextStatus !== existing.status) {
        if (!["pending", "approved", "rejected", "paid"].includes(nextStatus)) {
          return res.status(400).json({ message: "Invalid status." });
        }
        updates.status = nextStatus;
        if (["approved", "rejected", "paid"].includes(nextStatus)) {
          updates.processedAt = /* @__PURE__ */ new Date();
        }
        if (nextStatus === "rejected" && ["pending", "approved"].includes(existing.status)) {
          await refundWithdrawalHold({ ...existing, amount: updates.amount ?? existing.amount });
        }
      }
      const withdrawal = await storage.updateWithdrawal(req.params.id, updates);
      if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
      if (updates.status) {
        try {
          const requesterUserId = await getWithdrawalRequesterUserId(withdrawal);
          if (requesterUserId) {
            const amt = Number(withdrawal.amount || 0).toFixed(2);
            const copy = updates.status === "approved" ? `Your withdrawal of R${amt} was approved. The EFT payment is being processed.` : updates.status === "paid" ? `Your withdrawal of R${amt} has been paid via EFT to ${withdrawal.bankName}.` : updates.status === "rejected" ? `Your withdrawal of R${amt} was declined. The funds have been returned to your balance.` : `Your withdrawal of R${amt} was updated.`;
            await storage.createNotification({
              userId: requesterUserId,
              title: "Withdrawal update",
              body: copy,
              type: "withdrawal"
            });
            const requester = await storage.getUser(requesterUserId);
            if (requester?.pushToken) {
              sendExpoPushNotification([requester.pushToken], "Withdrawal update", copy, { type: "withdrawal" });
            }
          }
        } catch {
        }
      }
      return res.json(withdrawal);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/messages", async (req, res) => {
    try {
      const { rideId: _rid, senderId: _sid, messageText: _mt } = req.body;
      console.log(`[POST /api/messages] rideId=${_rid} senderId=${_sid} text="${(_mt || "").slice(0, 40)}"`);
      const message = await storage.createMessage(req.body);
      io.emit("chat:newMessage", message);
      const { rideId, senderId, messageText: msgText } = req.body;
      if (rideId && senderId) {
        try {
          const ride = await storage.getRide(rideId);
          if (ride) {
            const previewText = (msgText || "").slice(0, 80);
            if (senderId === ride.clientId && ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.pushToken) {
                sendExpoPushNotification([chauffeur.pushToken], "New message from rider", previewText);
              }
              if (chauffeur?.userId) {
                await storage.createNotification({ userId: chauffeur.userId, type: "chat", title: "New message from rider", body: previewText, isRead: false });
              }
            } else if (ride.chauffeurId) {
              const chauffeur = await storage.getChauffeur(ride.chauffeurId);
              if (chauffeur?.userId && senderId !== ride.clientId) {
                const rider = await storage.getUser(ride.clientId);
                if (rider?.pushToken) {
                  sendExpoPushNotification(
                    [rider.pushToken],
                    "New message from chauffeur",
                    previewText,
                    { rideId: ride.id, type: "chat:new" },
                    { urgent: true, channelId: "client-alerts" }
                  );
                }
                await storage.createNotification({ userId: ride.clientId, type: "chat", title: "New message from chauffeur", body: previewText, isRead: false });
              }
            }
          }
        } catch (e) {
          console.error("[chat] notification failed (non-fatal):", e.message);
        }
      }
      return res.json(message);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/messages/ride/:rideId", async (req, res) => {
    try {
      const messagesList = await storage.getMessagesByRide(req.params.rideId);
      return res.json(messagesList);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/safety-reports", async (req, res) => {
    try {
      const { userId, rideId, type, description } = req.body;
      const aiResponse = generateAIResponse(type, description);
      const priority = type === "emergency" ? "high" : type === "safety" ? "medium" : "low";
      const report = await storage.createSafetyReport({
        userId,
        rideId: rideId || null,
        type,
        description,
        aiResponse,
        priority,
        status: "open"
      });
      await storage.createNotification({
        userId,
        title: type === "emergency" ? "Emergency Report Filed" : "Report Received",
        body: aiResponse,
        type: "safety"
      });
      io.emit("safety:newReport", report);
      return res.json({ report, aiResponse });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/safety-reports/user/:userId", async (req, res) => {
    try {
      const reports = await storage.getSafetyReportsByUser(req.params.userId);
      return res.json(reports);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/safety-reports", async (_req, res) => {
    try {
      const allReports = await storage.getAllSafetyReports();
      return res.json(allReports);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/safety-reports/:id", async (req, res) => {
    try {
      const report = await storage.updateSafetyReport(req.params.id, req.body);
      if (!report) return res.status(404).json({ message: "Report not found" });
      return res.json(report);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.params.userId);
      return res.json(notifs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/notifications/:id/read", async (req, res) => {
    try {
      const notif = await storage.markNotificationRead(req.params.id);
      if (!notif) return res.status(404).json({ message: "Notification not found" });
      return res.json(notif);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/notifications/user/:userId/all", async (req, res) => {
    try {
      await storage.deleteAllNotificationsByUser(req.params.userId);
      return res.json({ message: "All notifications cleared" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/trip-enquiries", requireAuth, async (req, res) => {
    try {
      const { rideId, message } = req.body;
      if (!rideId || !message?.trim()) return res.status(400).json({ message: "rideId and message are required" });
      const enquiry = await storage.createTripEnquiry({ rideId, userId: req.auth.sub, message: message.trim() });
      const allUsers = await db2.select().from(users).where((0, import_drizzle_orm4.eq)(users.role, "admin"));
      for (const admin of allUsers) {
        await storage.createNotification({
          userId: admin.id,
          type: "general",
          title: "\u{1F4E9} New Trip Enquiry",
          body: `A user submitted a help request about a trip: "${message.trim().slice(0, 80)}${message.length > 80 ? "\u2026" : ""}"`,
          isRead: false
        });
      }
      return res.json(enquiry);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/trip-enquiries", requireAuth, requireRole(["admin"]), async (_req, res) => {
    try {
      const enquiries = await storage.getAllTripEnquiries();
      return res.json(enquiries);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/trip-enquiries/:id/reply", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const { reply } = req.body;
      if (!reply?.trim()) return res.status(400).json({ message: "reply is required" });
      const enquiry = await storage.replyToTripEnquiry(req.params.id, reply.trim());
      if (!enquiry) return res.status(404).json({ message: "Enquiry not found" });
      await storage.createNotification({
        userId: enquiry.userId,
        type: "general",
        title: "\u{1F4AC} Admin replied to your trip enquiry",
        body: reply.trim(),
        isRead: false
      });
      return res.json(enquiry);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get(
    "/api/admin/payments",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const [allPayments, allUsers, allRides] = await Promise.all([
          storage.getAllPayments(),
          storage.getAllUsers ? storage.getAllUsers() : [],
          storage.getAllRides()
        ]);
        const usersById = Object.fromEntries(allUsers.map((u) => [u.id, u]));
        const ridesById = Object.fromEntries(allRides.map((r) => [r.id, r]));
        const enriched = allPayments.map((p) => ({
          ...p,
          riderName: usersById[p.payerUserId]?.name || "Unknown",
          riderEmail: usersById[p.payerUserId]?.username || "\u2014",
          rideRoute: ridesById[p.rideId] ? `${ridesById[p.rideId].pickupAddress || "?"} \u2192 ${ridesById[p.rideId].dropoffAddress || "?"}` : p.rideId ? `Ride ${p.rideId.slice(0, 8)}` : "Wallet top-up"
        }));
        return res.json(enriched);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.get(
    "/api/admin/liveness-selfies",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const allRides = await storage.getAllRides();
        const selfieRides = allRides.filter((ride) => Boolean(ride.cashSelfieUrl)).sort((a, b) => {
          const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return right - left;
        });
        const records = await Promise.all(
          selfieRides.map(async (ride) => {
            const rider = await storage.getUser(ride.clientId);
            const chauffeur = ride.chauffeurId ? await storage.getChauffeur(ride.chauffeurId) : void 0;
            const chauffeurUser = chauffeur?.userId ? await storage.getUser(chauffeur.userId) : void 0;
            return {
              rideId: ride.id,
              riderId: ride.clientId,
              riderName: rider?.name || "Unknown Rider",
              riderEmail: rider?.username || "",
              chauffeurId: chauffeur?.id || null,
              chauffeurName: chauffeurUser?.name || null,
              pickupAddress: ride.pickupAddress || null,
              dropoffAddress: ride.dropoffAddress || null,
              paymentMethod: ride.paymentMethod || "cash",
              paymentStatus: ride.paymentStatus || "unpaid",
              rideStatus: ride.status || "requested",
              price: ride.price || 0,
              cashSelfieUrl: ride.cashSelfieUrl,
              livenessStatus: ride.livenessStatus || "not_required",
              livenessProvider: ride.livenessProvider || "mock",
              livenessScore: ride.livenessScore,
              livenessVerifiedAt: ride.livenessVerifiedAt,
              createdAt: ride.createdAt
            };
          })
        );
        return res.json(records);
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.get(
    "/api/admin/stats",
    requireAuth,
    requireRole(["admin"]),
    async (_req, res) => {
      try {
        const allRides = await storage.getAllRides();
        const allChauffeurs = await storage.getAllChauffeurs();
        const allWithdrawals = await storage.getAllWithdrawals();
        const allReports = await storage.getAllSafetyReports();
        const allEarnings = await storage.getAllEarnings();
        const driverApplications2 = await storage.getDriverApplications().catch(() => []);
        const applicationStatusByUserId = new Map(driverApplications2.map((app3) => [app3.userId, app3.status]));
        const completedRides = allRides.filter((r) => r.status === "trip_completed");
        const totalRevenue = completedRides.reduce((sum, r) => sum + (r.price || 0), 0);
        const totalPlatformCommission = allEarnings.reduce((sum, e) => sum + (e.commission || 0), 0);
        const totalDriverEarnings = allEarnings.reduce((sum, e) => sum + (e.amount || 0), 0);
        const activeRides = allRides.filter(
          (r) => !["trip_completed", "cancelled"].includes(r.status)
        );
        const pendingApprovals = allChauffeurs.filter((c) => !c.isApproved && applicationStatusByUserId.get(c.userId) !== "waitlisted");
        const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending");
        const openReports = allReports.filter((r) => r.status === "open");
        return res.json({
          totalRides: allRides.length,
          completedRides: completedRides.length,
          activeRides: activeRides.length,
          totalRevenue: Math.round(totalRevenue),
          totalPlatformCommission: Math.round(totalPlatformCommission),
          totalDriverEarnings: Math.round(totalDriverEarnings),
          commissionRate: 25,
          totalChauffeurs: allChauffeurs.length,
          onlineChauffeurs: allChauffeurs.filter((c) => c.isOnline).length,
          pendingApprovals: pendingApprovals.length,
          pendingWithdrawals: pendingWithdrawals.length,
          openReports: openReports.length,
          totalReports: allReports.length
        });
      } catch (error) {
        return res.status(500).json({ message: error.message });
      }
    }
  );
  app2.post("/api/admin/seed", async (req, res) => {
    try {
      const { username, password, name, seedSecret } = req.body;
      const existing = await storage.getUserByUsername(username || "admin");
      if (existing && existing.role === "admin") {
        return res.status(400).json({ message: "Admin user already exists" });
      }
      const validSecret = process.env.ADMIN_SEED_SECRET || process.env.JWT_SECRET;
      if (existing && seedSecret !== validSecret) {
        return res.status(403).json({ message: "Invalid seed secret" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(password || "Admin@2026!", 10);
      const user = await storage.createUser({
        username: username || "admin",
        password: hashedPassword,
        name: name || "A2B Admin",
        phone: null,
        role: "admin"
      });
      const { password: _pw, ...safeUser } = user;
      return res.json({ message: "Admin user created", user: safeUser });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/external/health", async (_req, res) => {
    try {
      const result = await externalApiService.healthCheck();
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.get("/api/external/status", async (_req, res) => {
    try {
      const result = await externalApiService.getStatus();
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  app2.use("/api/external", async (req, res, next) => {
    try {
      const endpoint = req.path.replace("/api/external", "") || "/";
      const result = await externalApiService.request(endpoint, {
        method: req.method || "GET",
        body: Object.keys(req.body || {}).length > 0 ? req.body : void 0,
        headers: req.headers
      });
      return res.status(result.statusCode || 200).json(result);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
  const paystackAPI = import_axios.default.create({
    baseURL: "https://api.paystack.co",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json"
    }
  });
  async function recordWalletTx(userId, type, amount, balanceBefore, description, reference, rideId) {
    const balanceAfter = type === "ride_charge" || type === "withdrawal" ? balanceBefore - amount : balanceBefore + amount;
    await storage.createWalletTransaction({
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      reference,
      description,
      rideId,
      status: "completed"
    });
    return balanceAfter;
  }
  function isAllowedPaystackReturnUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
    try {
      const url = new URL(rawUrl);
      if (["a2bliftclient:", "a2blift:", "exp:", "exps:"].includes(url.protocol)) return true;
      if (url.protocol === "https:" && ["a2blift.com", "www.a2blift.com"].includes(url.hostname)) return true;
    } catch {
      return false;
    }
    return false;
  }
  function appendPaystackReturnParams(rawUrl, params) {
    try {
      const url = new URL(rawUrl);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      return url.toString();
    } catch {
      return rawUrl;
    }
  }
  app2.get("/api/payments/webview-callback", (req, res) => {
    const reference = req.query.reference || req.query.trxref || "";
    const status = String(req.query.status || "");
    const appVariant = String(req.query.app || "").toLowerCase();
    const defaultNativeReturnUrl = appVariant === "driver" ? "a2blift://payments/paystack-callback" : appVariant === "client" ? "a2bliftclient://payments/paystack-callback" : "";
    const requestedReturnUrl = req.query.returnUrl;
    const nativeReturnUrl = isAllowedPaystackReturnUrl(requestedReturnUrl) ? requestedReturnUrl : defaultNativeReturnUrl;
    const nativeAppUrl = nativeReturnUrl ? appendPaystackReturnParams(nativeReturnUrl, { reference, status }) : "";
    const webFallbackUrl = process.env.FRONTEND_URL || getAppBaseUrl(req) || "https://a2blift.com";
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Payment Complete</title>
  <script>
    (function(){
      var appUrl = ${JSON.stringify(nativeAppUrl)};
      if (appUrl && !appUrl.startsWith('https://')) {
        try { window.location.replace(appUrl); } catch(e) { window.location.href = appUrl; }
      }
    })();
  </script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         display:flex;flex-direction:column;align-items:center;justify-content:center;
         min-height:100vh;gap:16px;text-align:center;padding:32px}
    .ring{width:72px;height:72px;animation:pop .45s cubic-bezier(.34,1.56,.64,1)}
    @keyframes pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
    h2{font-size:20px;font-weight:700;letter-spacing:-.3px}
    .sub{font-size:14px;color:rgba(255,255,255,0.45);line-height:1.5;max-width:260px}
    .btn{margin-top:8px;padding:13px 28px;background:#fff;color:#000;font-weight:700;
         font-size:14px;border-radius:12px;border:none;cursor:pointer;letter-spacing:-.2px}
  </style>
</head>
<body>
  <svg class="ring" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="36" cy="36" r="34" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <circle cx="36" cy="36" r="34" stroke="#ffffff" stroke-width="2"
      stroke-dasharray="213" stroke-dashoffset="213"
      style="animation:draw .55s .3s ease forwards;transform-origin:center;transform:rotate(-90deg)"/>
    <polyline points="22,36 32,46 50,28" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
      style="opacity:0;animation:fadein .2s .75s forwards"/>
    <style>
      @keyframes draw{to{stroke-dashoffset:0}}
      @keyframes fadein{to{opacity:1}}
    </style>
  </svg>
  <h2>Payment Complete</h2>
  <p class="sub" id="status-text">Your payment was processed. Returning to A2B LIFT...</p>
  <button class="btn" id="back-btn" style="display:none" onclick="goBack()">Return to App</button>
  <script>
    var ref = ${JSON.stringify(reference)};
    var appUrl = ${JSON.stringify(nativeAppUrl)};
    var fallbackUrl = ${JSON.stringify(webFallbackUrl)};
    var msg = { type: 'paystack-done', reference: ref };

    // 1. Send postMessage to any listening parent/opener (web popup flow)
    var sent = false;
    try { if(window.opener){ window.opener.postMessage(msg,'*'); sent=true; } } catch(e){}
    try { if(window.parent && window.parent!==window){ window.parent.postMessage(msg,'*'); sent=true; } } catch(e){}

    // 2. Native app flow: jump back to the app scheme so AuthSession can resolve.
    if (appUrl && !appUrl.startsWith('https://')) {
      setTimeout(function(){ window.location.replace(appUrl); }, 50);
      setTimeout(function(){ window.location.href = appUrl; }, 450);
    }

    // 3. Attempt to close popup/tab
    function tryClose() {
      try { window.close(); } catch(e){}
    }

    // 4. If window didn't close or app return failed, show button after 1.5s
    var closeTimer = setTimeout(tryClose, 800);
    setTimeout(function() {
      document.getElementById('back-btn').style.display = 'inline-block';
      document.getElementById('status-text').textContent = sent
        ? 'App notified. Tap the button if the screen did not update.'
        : 'Tap below to return to the app.';
    }, 1600);

    function goBack() {
      // Try postMessage one more time then close / redirect
      try { if(window.opener){ window.opener.postMessage(msg,'*'); } } catch(e){}
      try { window.close(); } catch(e){}
      setTimeout(function(){ window.location.href = appUrl || fallbackUrl; }, 300);
    }
  </script>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  });
  app2.post("/api/payments/initialize", requireAuth, async (req, res) => {
    try {
      const { amount, email: clientEmail, rideId, saveCard, saveCardOnly, appVariant, appReturnUrl } = req.body;
      const userId = req.auth.sub;
      const reference = `A2B-${Date.now()}-${userId.slice(0, 6)}`;
      const user = await storage.getUser(userId);
      const email = user?.email && user.email.includes("@") ? user.email : clientEmail;
      if (!email || !email.includes("@")) {
        return res.status(400).json({ message: "A valid email address is required to process payments. Please update your profile email." });
      }
      const domain = getAppBaseUrl(req);
      const callback = new URL(`${domain}/api/payments/webview-callback`);
      callback.searchParams.set("reference", reference);
      if (appVariant === "client" || appVariant === "driver") callback.searchParams.set("app", appVariant);
      if (isAllowedPaystackReturnUrl(appReturnUrl)) callback.searchParams.set("returnUrl", appReturnUrl);
      const callbackUrl = callback.toString();
      const response = await paystackAPI.post("/transaction/initialize", {
        email,
        amount: Math.round(amount * 100),
        currency: "ZAR",
        reference,
        ...callbackUrl ? { callback_url: callbackUrl } : {},
        metadata: {
          userId,
          rideId: rideId || null,
          saveCard: saveCard || false,
          saveCardOnly: saveCardOnly || false,
          custom_fields: [
            { display_name: "App", variable_name: "app", value: "A2B LIFT" }
          ]
        },
        channels: ["card"]
      });
      const { authorization_url, access_code, reference: ref } = response.data.data;
      if (rideId) {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount,
          method: "card",
          status: "pending",
          currency: "ZAR",
          paystackReference: reference
        });
      }
      return res.json({ authorizationUrl: authorization_url, accessCode: access_code, reference: ref });
    } catch (error) {
      console.error("[Paystack Initialize]", error.response?.data || error.message);
      return res.status(500).json({ message: "Payment initialization failed" });
    }
  });
  app2.post("/api/payments/verify", requireAuth, async (req, res) => {
    try {
      const { reference } = req.body;
      const userId = req.auth.sub;
      const response = await paystackAPI.get(`/transaction/verify/${reference}`);
      const txData = response.data.data;
      if (txData.status !== "success") {
        return res.status(400).json({ message: "Payment not successful", status: txData.status });
      }
      const amount = txData.amount / 100;
      const metadata = txData.metadata || {};
      if (metadata.saveCard && txData.authorization?.reusable) {
        const auth = txData.authorization;
        const existingCards = await storage.getSavedCardsByUser(userId);
        const alreadySaved = existingCards.find((c) => c.last4 === auth.last4 && c.expYear === auth.exp_year);
        if (!alreadySaved) {
          await storage.createSavedCard({
            userId,
            paystackAuthCode: auth.authorization_code,
            cardType: auth.card_type,
            last4: auth.last4,
            expMonth: auth.exp_month,
            expYear: auth.exp_year,
            bank: auth.bank,
            isDefault: existingCards.length === 0
          });
        }
      }
      if (metadata.rideId) {
        const payments2 = await storage.getPaymentsByRide(metadata.rideId);
        const pending = payments2.find((p) => p.paystackReference === reference);
        if (pending) {
          await storage.updatePayment(pending.id, {
            status: "paid",
            paidAt: /* @__PURE__ */ new Date(),
            paystackAuthCode: txData.authorization?.authorization_code
          });
        }
        await storage.updateRide(metadata.rideId, { paymentStatus: "paid" });
      }
      if (!metadata.rideId && !metadata.saveCardOnly) {
        const user = await storage.getUser(userId);
        const balanceBefore = user?.walletBalance || 0;
        const newBalance = balanceBefore + amount;
        await storage.updateUser(userId, { walletBalance: newBalance });
        await recordWalletTx(userId, "topup", amount, balanceBefore, "Wallet top-up via card", reference);
      }
      return res.json({ success: true, amount, status: "paid" });
    } catch (error) {
      console.error("[Paystack Verify]", error.response?.data || error.message);
      const psMsg = error.response?.data?.message;
      if (psMsg) return res.status(400).json({ message: psMsg });
      return res.status(500).json({ message: "Payment verification failed" });
    }
  });
  app2.post("/api/payments/charge-card", requireAuth, async (req, res) => {
    try {
      const { cardId, rideId, amount, email } = req.body;
      const userId = req.auth.sub;
      const card = await storage.getSavedCard(cardId);
      if (!card || card.userId !== userId) {
        return res.status(404).json({ message: "Card not found" });
      }
      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: card.paystackAuthCode,
        email,
        amount: Math.round(amount * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId }
      });
      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount,
          method: "card",
          status: "paid",
          currency: "ZAR",
          paidAt: /* @__PURE__ */ new Date(),
          paystackReference: reference
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference });
      }
      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error) {
      console.error("[Paystack Charge Card]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });
  app2.post("/api/payments/charge-ride", requireAuth, async (req, res) => {
    try {
      const { rideId } = req.body;
      const userId = req.auth.sub;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const ride = await storage.getRide(rideId);
      if (!ride) return res.status(404).json({ message: "Ride not found" });
      const cards = await storage.getSavedCardsByUser(userId);
      const defaultCard = cards.find((c) => c.isDefault) || cards[0];
      if (!defaultCard) {
        return res.status(400).json({ message: "No saved card found. Please add a card in your wallet.", needsCard: true });
      }
      const amount = ride.price || ride.totalPrice || ride.estimatedPrice;
      if (!amount) return res.status(400).json({ message: "Ride has no price set" });
      const reference = `A2B-RIDE-${rideId}-${Date.now()}`;
      const response = await paystackAPI.post("/transaction/charge_authorization", {
        authorization_code: defaultCard.paystackAuthCode,
        email: user.username,
        amount: Math.round(Number(amount) * 100),
        currency: "ZAR",
        reference,
        metadata: { userId, rideId }
      });
      const txData = response.data.data;
      if (txData.status === "success") {
        await storage.createPayment({
          rideId,
          payerUserId: userId,
          amount: Number(amount),
          method: "card",
          status: "paid",
          currency: "ZAR",
          paidAt: /* @__PURE__ */ new Date(),
          paystackReference: reference,
          paystackAuthCode: defaultCard.paystackAuthCode
        });
        await storage.updateRide(rideId, { paymentStatus: "paid" });
        return res.json({ success: true, reference, card: { last4: defaultCard.last4, cardType: defaultCard.cardType } });
      }
      return res.status(400).json({ message: "Card charge failed", status: txData.status });
    } catch (error) {
      console.error("[Paystack Charge Ride]", error.response?.data || error.message);
      return res.status(500).json({ message: "Card charge failed" });
    }
  });
  app2.post("/api/payments/pay-wallet", requireAuth, async (req, res) => {
    try {
      const { rideId } = req.body;
      let { amount } = req.body;
      const userId = req.auth.sub;
      if (!amount) {
        const ride = await storage.getRide(rideId);
        if (!ride) return res.status(404).json({ message: "Ride not found" });
        amount = ride.price || ride.totalPrice || ride.estimatedPrice;
        if (!amount) return res.status(400).json({ message: "Ride has no price set" });
      }
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const walletBefore = Number(user.walletBalance || 0);
      const rewardsBefore = Number(user.rewardsBalance || 0);
      if (walletBefore + rewardsBefore < amount) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }
      const fromWallet = Math.min(walletBefore, amount);
      const fromRewards = amount - fromWallet;
      await storage.updateUser(userId, {
        walletBalance: walletBefore - fromWallet,
        ...fromRewards > 0 ? { rewardsBalance: rewardsBefore - fromRewards } : {}
      });
      await storage.createPayment({
        rideId,
        payerUserId: userId,
        amount,
        method: "wallet",
        status: "paid",
        currency: "ZAR",
        paidAt: /* @__PURE__ */ new Date()
      });
      await storage.updateRide(rideId, {
        paymentStatus: "paid",
        ...fromRewards > 0 ? { rewardsAmountUsed: fromRewards } : {}
      });
      if (fromWallet > 0) {
        await recordWalletTx(userId, "ride_charge", fromWallet, walletBefore, "Ride payment", void 0, rideId);
      }
      if (fromRewards > 0) {
        await storage.createNotification({
          userId,
          title: "Rewards used",
          body: `R${fromRewards.toFixed(2)} of your rewards balance was used to pay for your ride.`,
          type: "reward"
        }).catch(() => {
        });
      }
      return res.json({ success: true, newBalance: walletBefore - fromWallet, rewardsBalance: rewardsBefore - fromRewards });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/payments/cards", requireAuth, async (req, res) => {
    try {
      const cards = await storage.getSavedCardsByUser(req.auth.sub);
      return res.json(cards);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/payments/cards/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteSavedCard(req.params.id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.put("/api/payments/cards/:id/default", requireAuth, async (req, res) => {
    try {
      const userId = req.auth.sub;
      const cards = await storage.getSavedCardsByUser(userId);
      for (const card of cards) {
        await storage.updateSavedCard(card.id, { isDefault: card.id === req.params.id });
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/wallet/transactions", requireAuth, async (req, res) => {
    try {
      const txs = await storage.getWalletTransactions(req.auth.sub);
      return res.json(txs);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/wallet/withdraw", requireAuth, async (req, res) => {
    try {
      const { amount, bankCode, bankName: bankNameInput, accountNumber, accountName } = req.body;
      const userId = req.auth.sub;
      if (!amount || !bankCode || !accountNumber || !accountName) {
        return res.status(400).json({ message: "amount, bankCode, accountNumber and accountName are required" });
      }
      const chauffeur = await storage.getChauffeurByUserId(userId);
      if (!chauffeur) return res.status(404).json({ message: "Chauffeur not found" });
      if ((chauffeur.earningsTotal || 0) < amount) {
        return res.status(400).json({ message: `You only have R${(chauffeur.earningsTotal || 0).toFixed(2)} available to withdraw. Please enter a lower amount.` });
      }
      const recipientRes = await paystackAPI.post("/transferrecipient", {
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "ZAR"
      });
      const recipientCode = recipientRes.data.data.recipient_code;
      const transferRef = `A2B-WITHDRAW-${Date.now()}`;
      const transferRes = await paystackAPI.post("/transfer", {
        source: "balance",
        amount: Math.round(amount * 100),
        recipient: recipientCode,
        reason: "A2B LIFT earnings withdrawal",
        reference: transferRef,
        currency: "ZAR"
      });
      const transferCode = transferRes.data.data.transfer_code;
      const status = transferRes.data.data.status;
      await storage.createWithdrawal({
        chauffeurId: chauffeur.id,
        amount,
        status: status === "success" ? "completed" : "pending",
        bankName: bankNameInput || bankCode,
        accountNumber,
        accountHolder: accountName,
        paystackTransferCode: transferCode,
        paystackRecipientCode: recipientCode
      });
      await storage.updateChauffeur(chauffeur.id, {
        earningsTotal: (chauffeur.earningsTotal || 0) - amount
      });
      return res.json({
        success: true,
        message: status === "success" ? "Transfer successful" : "Transfer initiated \u2014 funds arrive within 24hrs",
        transferCode,
        status
      });
    } catch (error) {
      console.error("[Paystack Withdraw]", error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data?.message || error.message });
    }
  });
  app2.get("/api/wallet/banks", async (_req, res) => {
    try {
      const response = await paystackAPI.get("/bank?currency=ZAR&country=south+africa");
      const banks = response.data.data.map((b) => ({ name: b.name, code: b.code, id: b.id }));
      return res.json(banks);
    } catch (error) {
      return res.json([
        { name: "ABSA Bank", code: "632005" },
        { name: "African Bank", code: "430000" },
        { name: "Albaraka Bank", code: "800000" },
        { name: "Bidvest Bank", code: "462005" },
        { name: "Capitec Bank", code: "470010" },
        { name: "Discovery Bank", code: "679000" },
        { name: "Finbond Mutual Bank", code: "589000" },
        { name: "First National Bank (FNB)", code: "250655" },
        { name: "Grindrod Bank", code: "584000" },
        { name: "HBZ Bank", code: "570000" },
        { name: "Investec Bank", code: "580105" },
        { name: "Mercantile Bank", code: "450905" },
        { name: "Nedbank", code: "198765" },
        { name: "Old Mutual Bank", code: "462005" },
        { name: "Postbank", code: "460005" },
        { name: "Sasfin Bank", code: "683000" },
        { name: "Standard Bank", code: "051001" },
        { name: "State Bank of India", code: "801000" },
        { name: "TymeBank", code: "678910" },
        { name: "Ubank (Teba Bank)", code: "431010" },
        { name: "VBS Mutual Bank", code: "588000" }
      ]);
    }
  });
  app2.post("/api/payments/webhook", async (req, res) => {
    try {
      const hash = import_node_crypto.default.createHmac("sha512", PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest("hex");
      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(401).json({ message: "Invalid signature" });
      }
      const { event, data } = req.body;
      if (event === "charge.success") {
        console.log("[Webhook] Payment successful:", data.reference);
      }
      if (event === "transfer.success") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, {
          status: "completed",
          processedAt: /* @__PURE__ */ new Date()
        });
      }
      if (event === "transfer.failed") {
        await storage.updateWithdrawalByTransferCode(data.transfer_code, { status: "failed" });
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error("[Webhook Error]", error.message);
      return res.sendStatus(200);
    }
  });
  app2.post("/api/rides/:id/select-route", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { selectedRouteId, distanceKm, fare, currency = "ZAR" } = req.body;
      if (distanceKm == null || fare == null || !selectedRouteId) {
        return res.status(400).json({ error: "selectedRouteId, distanceKm and fare are required" });
      }
      const ride = await storage.getRide(id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });
      const authedReq = req;
      const chauffeur = authedReq.auth?.role !== "admin" ? await storage.getChauffeur(ride.chauffeurId ?? "") : null;
      if (chauffeur && chauffeur.userId !== authedReq.auth.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.updateRide(id, {
        selectedRouteId,
        selectedRouteDistanceKm: distanceKm,
        actualFare: fare,
        routeCurrency: currency,
        routeSelectedAt: /* @__PURE__ */ new Date()
      });
      io.to(`ride:${id}`).emit("route_confirmed", {
        rideId: id,
        selectedRouteId,
        distanceKm,
        fare,
        currency,
        confirmedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return res.json({ success: true, rideId: id, lockedFare: fare });
    } catch (err) {
      console.error("[select-route]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/rides/:id/upload-photo", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { photoBase64, photoType, sessionId, mimeType } = req.body;
      if (!photoBase64 || !photoType) {
        return res.status(400).json({ error: "photoBase64 and photoType are required" });
      }
      if (!SUPABASE_SERVICE_KEY_CONFIGURED) {
        return res.status(503).json({ error: "Photo storage not configured (SUPABASE_SERVICE_ROLE_KEY missing)" });
      }
      const result = await uploadLivenessPhoto({
        sessionId: sessionId || id,
        userId: req.auth.sub,
        rideId: id,
        photoBase64,
        mimeType: mimeType || "image/jpeg",
        photoType
      });
      if (!result.success) {
        return res.status(500).json({ error: result.error || "Upload failed" });
      }
      return res.json({ success: true, storagePath: result.storagePath, publicUrl: result.publicUrl });
    } catch (err) {
      console.error("[upload-photo]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/admin/rides/:id/photos", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const ride = await storage.getRide(req.params.id);
      if (!ride) return res.status(404).json({ error: "Ride not found" });
      const livSessions = await db2.select().from(livenessSessions).where((0, import_drizzle_orm4.eq)(livenessSessions.rideId, req.params.id)).orderBy((0, import_drizzle_orm4.desc)(livenessSessions.createdAt));
      const SUPABASE_URL2 = process.env.SUPABASE_URL || "https://zzwkieiktbhptvgsqerd.supabase.co";
      const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      async function makeSignedUrl(bucket, path2) {
        if (!path2 || !SERVICE_KEY) return null;
        const bare = path2.replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//, "");
        return getAdminSignedUrl(bucket, bare);
      }
      const cashSelfieSignedUrl = await makeSignedUrl("ride-photos", ride.cashSelfieUrl);
      const livPhotos = await Promise.all(
        livSessions.map(async (sess) => ({
          id: sess.id,
          status: sess.status,
          score: sess.score,
          provider: sess.provider,
          verifiedAt: sess.verifiedAt,
          signedUrl: await makeSignedUrl("liveness-photos", sess.verifiedPhotoUrl ?? sess.selfieUrl)
        }))
      );
      return res.json({
        rideId: req.params.id,
        cashSelfie: {
          storagePath: ride.cashSelfieUrl,
          signedUrl: cashSelfieSignedUrl
        },
        livenessPhotos: livPhotos
      });
    } catch (err) {
      console.error("[admin/rides/photos]", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.delete("/api/admin/rides/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteRide(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Ride not found" });
      return res.json({ message: "Ride deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/users/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const chauffeur = await storage.getChauffeurByUserId(req.params.id);
      if (chauffeur) {
        const app3 = await storage.getDriverApplicationByUserId(req.params.id);
        if (app3) await storage.deleteDriverApplication(app3.id);
        await storage.deleteChauffeur(chauffeur.id);
      }
      const deleted = await storage.deleteUserCascade(req.params.id);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      return res.json({ message: "User deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/withdrawals/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const existing = await storage.getWithdrawal(req.params.id);
      if (!existing) return res.status(404).json({ message: "Withdrawal not found" });
      if (["pending", "approved"].includes(existing.status)) {
        await refundWithdrawalHold(existing);
      }
      const deleted = await storage.deleteWithdrawal(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Withdrawal not found" });
      return res.json({ message: "Withdrawal deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/safety-reports/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteSafetyReport(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Safety report not found" });
      return res.json({ message: "Safety report deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/payments/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deletePayment(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Payment not found" });
      return res.json({ message: "Payment deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/admin/documents/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
    try {
      const deleted = await storage.deleteDocument(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Document not found" });
      return res.json({ message: "Document deleted" });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });
  return httpServer;
}

// server/index.ts
var import_cookie_parser = __toESM(require("cookie-parser"));
var import_helmet = __toESM(require("helmet"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var import_http_proxy_middleware = require("http-proxy-middleware");
var app = (0, import_express.default)();
var log = console.log;
var projectRootCandidates = Array.from(
  /* @__PURE__ */ new Set([
    process.cwd(),
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", "..")
  ])
);
function resolveExistingFile(...segments) {
  for (const root of projectRootCandidates) {
    const candidate = path.resolve(root, ...segments);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return void 0;
}
function resolveExistingDirectory(...segments) {
  for (const root of projectRootCandidates) {
    const candidate = path.resolve(root, ...segments);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return void 0;
}
function resolveProjectPath(...segments) {
  return path.resolve(projectRootCandidates[0], ...segments);
}
function addUrlOrigin(origins, rawUrl) {
  if (!rawUrl) return;
  try {
    origins.add(new URL(rawUrl).origin);
  } catch {
  }
}
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    origins.add("https://a2blift.com");
    origins.add("https://www.a2blift.com");
    origins.add("https://a2b-lift.onrender.com");
    origins.add("https://peaceful-mousse-459c85.netlify.app");
    addUrlOrigin(origins, process.env.FRONTEND_URL);
    addUrlOrigin(origins, process.env.PUBLIC_REFERRAL_BASE_URL);
    addUrlOrigin(origins, process.env.EXPO_PUBLIC_REFERRAL_BASE_URL);
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.add(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:") || origin?.startsWith("http://192.168.") || origin?.startsWith("http://10.") || origin?.includes(".exp.direct") || origin?.includes(".trycloudflare.com") || origin?.includes(".serveousercontent.com") || origin?.includes(".gitpod.dev") || origin?.includes(".up.railway.app") || origin?.includes(".netlify.app") || origin?.match(/^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./) !== null;
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupSecurity(app2) {
  app2.use(
    (0, import_helmet.default)({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://js.paystack.co", "https://checkout.paystack.com"],
          scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://maps.googleapis.com", "https://maps.gstatic.com", "https://js.paystack.co", "https://checkout.paystack.com"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https:", "wss:"],
          frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.paystack.com"],
          frameAncestors: ["'self'", "https://*.replit.dev", "https://*.repl.co", "https://*.replit.com", "https://*.replit.app"]
        }
      },
      frameguard: false
    })
  );
  app2.use((0, import_cookie_parser.default)());
}
function setupBodyParsing(app2) {
  app2.use(
    import_express.default.json({
      limit: "20mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(import_express.default.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const requestPath = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!requestPath.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${requestPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
var METRO_PORTS = [8081, 8080, 8082];
var resolvedMetroPort = 8081;
async function detectMetroPort() {
  const net = await import("net");
  for (const port of METRO_PORTS) {
    const open = await new Promise((resolve2) => {
      const s = net.createConnection({ port, host: "127.0.0.1" });
      s.once("connect", () => {
        s.destroy();
        resolve2(true);
      });
      s.once("error", () => resolve2(false));
    });
    if (open) {
      resolvedMetroPort = port;
      return port;
    }
  }
  return resolvedMetroPort;
}
function hasStaticBuild() {
  return Boolean(resolveExistingFile("static-build", "index.html"));
}
function hasWebsiteBuild() {
  return Boolean(resolveExistingFile("website", "index.html"));
}
function makeMetroProxy(port) {
  return (0, import_http_proxy_middleware.createProxyMiddleware)({
    target: `http://localhost:${port}`,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.setHeader("Origin", `http://localhost:${port}`);
        proxyReq.setHeader("Host", `localhost:${port}`);
      },
      error: (_err, _req, res) => {
        if (res && typeof res.status === "function") {
          res.status(502).json({ error: "Metro bundler not reachable \u2014 is Start Frontend running?" });
        }
      }
    }
  });
}
var metroProxy = makeMetroProxy(8081);
async function configureExpoAndLanding(app2) {
  const isRailwayRuntime = Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID
  );
  const isProductionRuntime = process.env.NODE_ENV === "production" || isRailwayRuntime;
  const appPort = Number.parseInt(process.env.PORT || "", 10);
  let allowMetroProxy = !isProductionRuntime;
  const adminTemplatePath = resolveExistingFile("server", "templates", "admin.html") || resolveProjectPath("server", "templates", "admin.html");
  const adminTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
  const assetsRoot = resolveExistingDirectory("assets") || resolveProjectPath("assets");
  const staticBuildRoot = resolveExistingDirectory("static-build") || resolveProjectPath("static-build");
  const websiteRoot = resolveExistingDirectory("website") || resolveProjectPath("website");
  let metroPort = resolvedMetroPort;
  if (allowMetroProxy) {
    metroPort = await detectMetroPort();
    if (Number.isFinite(appPort) && appPort === metroPort) {
      allowMetroProxy = false;
      log(`Metro proxy disabled because target port ${metroPort} equals app PORT ${appPort}`);
    }
    metroProxy = makeMetroProxy(metroPort);
    log(`Metro bundler detected on port ${metroPort}`);
  }
  const staticBuildExists = hasStaticBuild();
  const websiteBuildExists = hasWebsiteBuild();
  if (!allowMetroProxy) {
    log(
      `Static build: ${staticBuildExists ? "found" : "not found"}; website build: ${websiteBuildExists ? "found" : "not found"} \u2014 production mode (Metro proxy disabled)`
    );
  } else {
    log(
      `Static build: ${staticBuildExists ? "found" : "not found"}; website build: ${websiteBuildExists ? "found" : "not found"} \u2014 routing non-API traffic to Metro:${metroPort}`
    );
  }
  const serveAdmin = (_req, res) => {
    const freshTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).send(freshTemplate);
  };
  app2.get("/admin", serveAdmin);
  app2.get("/a2b-admin", serveAdmin);
  const serveReferralLaunch = (req, res) => {
    const referralCode = req.params.code;
    const appTarget = String(req.query.app || req.query.source || req.query.role || "").trim();
    const params = new URLSearchParams();
    if (referralCode) params.set("code", referralCode);
    if (appTarget) params.set("app", appTarget);
    const clientIosUrl = process.env.A2B_CLIENT_IOS_APP_STORE_URL || process.env.EXPO_PUBLIC_CLIENT_IOS_APP_STORE_URL || "";
    const driverIosUrl = process.env.A2B_DRIVER_IOS_APP_STORE_URL || process.env.EXPO_PUBLIC_DRIVER_IOS_APP_STORE_URL || "";
    const clientAndroidUrl = process.env.A2B_CLIENT_ANDROID_STORE_URL || process.env.EXPO_PUBLIC_CLIENT_ANDROID_STORE_URL || "";
    const driverAndroidUrl = process.env.A2B_DRIVER_ANDROID_STORE_URL || process.env.EXPO_PUBLIC_DRIVER_ANDROID_STORE_URL || "https://play.google.com/store/apps/details?id=com.a2blift";
    if (clientIosUrl) params.set("clientIosUrl", clientIosUrl);
    if (driverIosUrl) params.set("driverIosUrl", driverIosUrl);
    if (clientAndroidUrl) params.set("clientAndroidUrl", clientAndroidUrl);
    if (driverAndroidUrl) params.set("driverAndroidUrl", driverAndroidUrl);
    const target = referralCode ? `/referral-launch.html?${params.toString()}` : "/referral-launch.html";
    res.redirect(302, target);
  };
  app2.get("/referral/:code", serveReferralLaunch);
  app2.get("/ref/:code", serveReferralLaunch);
  app2.get("/r/:code", serveReferralLaunch);
  app2.use("/assets", import_express.default.static(assetsRoot));
  if (websiteBuildExists) {
    app2.get("/", (_req, res) => {
      res.sendFile(path.resolve(websiteRoot, "index.html"));
    });
    app2.use(
      import_express.default.static(websiteRoot, {
        extensions: ["html"]
      })
    );
  }
  if (staticBuildExists) {
    app2.use(import_express.default.static(staticBuildRoot));
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      const platform = req.header("expo-platform");
      if (allowMetroProxy && (platform === "ios" || platform === "android")) {
        log(`[Metro proxy] ${platform} manifest \u2192 Metro:${metroPort}`);
        return metroProxy(req, res, next);
      }
      const staticIndex = path.resolve(staticBuildRoot, "index.html");
      res.sendFile(staticIndex);
    });
  } else if (websiteBuildExists) {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      const htmlPath = path.resolve(
        websiteRoot,
        `${req.path.replace(/^\//, "")}.html`
      );
      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }
      return res.status(404).sendFile(path.resolve(websiteRoot, "index.html"));
    });
  } else if (allowMetroProxy) {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      const platform = req.header("expo-platform") || "web";
      log(`[Metro proxy] ${platform} ${req.path} \u2192 Metro:${metroPort}`);
      return metroProxy(req, res, next);
    });
  } else {
    app2.use((req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path === "/r" || req.path.startsWith("/r/")) return next();
      if (req.path === "/admin" || req.path === "/a2b-admin" || req.path.startsWith("/admin/") || req.path.startsWith("/a2b-admin/")) return next();
      if (req.path.startsWith("/socket.io")) return next();
      return res.status(404).json({ message: "Web build not available on this deployment" });
    });
  }
  log("Expo routing configured");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  try {
    await pool2.query(`
      ALTER TABLE chauffeurs ALTER COLUMN vehicle_model DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN plate_number DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN vehicle_type DROP NOT NULL;
      ALTER TABLE chauffeurs ALTER COLUMN car_color DROP NOT NULL;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS available_for_long_distance boolean DEFAULT false;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_from text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_to text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_date text;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_price_per_seat real;
      ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS long_distance_seats_available integer DEFAULT 0;
    `);
    console.log("[MIGRATION] Long-distance columns ensured \u2705");
  } catch (err) {
    console.error("[MIGRATION] Warning: could not apply long-distance migration:", err.message);
  }
  try {
    await pool2.query(`ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS active_vehicle_id varchar`);
    await pool2.query(`ALTER TABLE rides ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
    await pool2.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS vehicle_id varchar`);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS operator_profiles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL UNIQUE REFERENCES users(id),
        type text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        rejection_reason text,
        submitted_at timestamp,
        reviewed_at timestamp,
        reviewer_admin_id varchar REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS partner_profiles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        operator_profile_id varchar NOT NULL UNIQUE REFERENCES operator_profiles(id),
        company_name text NOT NULL,
        registration_number text NOT NULL,
        contact_person_name text NOT NULL,
        contact_phone text NOT NULL,
        contact_email text NOT NULL,
        bank_name text NOT NULL,
        account_holder text NOT NULL,
        account_number text NOT NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        status text NOT NULL DEFAULT 'draft',
        car_make text NOT NULL,
        vehicle_model text NOT NULL,
        vehicle_year integer NOT NULL,
        plate_number text NOT NULL,
        vehicle_type text NOT NULL,
        car_color text NOT NULL,
        passenger_capacity integer DEFAULT 4,
        luggage_capacity integer DEFAULT 2,
        rejection_reason text,
        submitted_at timestamp,
        reviewed_at timestamp,
        reviewer_admin_id varchar REFERENCES users(id),
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool2.query(`CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_plate_unique ON vehicles (upper(plate_number)) WHERE status <> 'rejected'`);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS vehicle_assignments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        vehicle_id varchar NOT NULL REFERENCES vehicles(id),
        driver_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        assigned_by_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        status text NOT NULL DEFAULT 'active',
        created_at timestamp DEFAULT now(),
        removed_at timestamp
      )
    `);
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS fleet_driver_invites (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        invited_by_operator_profile_id varchar NOT NULL REFERENCES operator_profiles(id),
        invited_by_user_id varchar NOT NULL REFERENCES users(id),
        status text NOT NULL DEFAULT 'pending',
        email_status text NOT NULL DEFAULT 'queued',
        email_error text,
        message text,
        resend_id text,
        sent_at timestamp,
        accepted_at timestamp,
        declined_at timestamp,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await pool2.query(`
      CREATE INDEX IF NOT EXISTS fleet_driver_invites_manager_idx
        ON fleet_driver_invites (invited_by_operator_profile_id, created_at DESC)
    `);
    await pool2.query(`
      CREATE INDEX IF NOT EXISTS fleet_driver_invites_driver_idx
        ON fleet_driver_invites (driver_operator_profile_id, created_at DESC)
    `);
    console.log("[MIGRATION] Fleet onboarding tables ensured \u2705");
  } catch (err) {
    console.error("[MIGRATION] Warning: could not apply fleet onboarding migration:", err.message);
  }
  try {
    await pool2.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL REFERENCES users(id),
        token_hash text NOT NULL UNIQUE,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        requested_at timestamp DEFAULT now(),
        created_at timestamp DEFAULT now()
      )
    `);
    await pool2.query(`
      CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
        ON password_reset_tokens (user_id, created_at DESC)
    `);
    await pool2.query(`
      CREATE INDEX IF NOT EXISTS password_reset_tokens_lookup_idx
        ON password_reset_tokens (token_hash, expires_at)
        WHERE used_at IS NULL
    `);
    console.log("[MIGRATION] Password reset table ensured \u2705");
  } catch (err) {
    console.error("[MIGRATION] Warning: could not apply password reset migration:", err.message);
  }
  setupCors(app);
  setupSecurity(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  await configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  const portSource = process.env.PORT ? "process.env.PORT" : "default (5000)";
  server.listen(
    {
      port,
      host: "0.0.0.0",
      // Listen on all interfaces for deployment
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port} (from ${portSource})`);
    }
  );
})();
