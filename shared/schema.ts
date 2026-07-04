import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  profilePhoto: text("profile_photo"),
  pushToken: text("push_token"),
  // client (passenger) | chauffeur (driver) | admin
  role: text("role").notNull().default("client"),
  rating: real("rating").default(5.0),
  rewardsBalance: real("rewards_balance").default(0),
  referralCode: text("referral_code").unique(),
  referredByUserId: varchar("referred_by_user_id").references(() => users.id),
  walletBalance: real("wallet_balance").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chauffeurs = pgTable("chauffeurs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  carMake: text("car_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: integer("vehicle_year"),
  plateNumber: text("plate_number"),
  vehicleType: text("vehicle_type"),
  carColor: text("car_color"),
  phone: text("phone"),
  passengerCapacity: integer("passenger_capacity").default(4),
  luggageCapacity: integer("luggage_capacity").default(2),
  isOnline: boolean("is_online").default(false),
  isApproved: boolean("is_approved").default(false),
  availableForLongDistance: boolean("available_for_long_distance").default(false),
  longDistanceFrom: text("long_distance_from"),
  longDistanceTo: text("long_distance_to"),
  longDistanceDate: text("long_distance_date"),
  longDistancePricePerSeat: real("long_distance_price_per_seat"),
  longDistanceSeatsAvailable: integer("long_distance_seats_available").default(0),
  earningsTotal: real("earnings_total").default(0),
  profilePhoto: text("profile_photo"),
  lat: real("lat"),
  lng: real("lng"),
  locationUpdatedAt: timestamp("location_updated_at"),
  pushToken: text("push_token"),
  activeVehicleId: varchar("active_vehicle_id").references(() => vehicles.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rides = pgTable("rides", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  clientId: varchar("client_id")
    .notNull()
    .references(() => users.id),
  chauffeurId: varchar("chauffeur_id").references(() => chauffeurs.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  pickupLat: real("pickup_lat").notNull(),
  pickupLng: real("pickup_lng").notNull(),
  pickupAddress: text("pickup_address"),
  dropoffLat: real("dropoff_lat").notNull(),
  dropoffLng: real("dropoff_lng").notNull(),
  dropoffAddress: text("dropoff_address"),
  status: text("status").notNull().default("requested"),
  price: real("price"),
  pricePerKm: real("price_per_km"),
  baseFare: real("base_fare"),
  distanceKm: real("distance_km"),
  durationMin: real("duration_min"),
  vehicleType: text("vehicle_type"),
  dispatchStartedAt: timestamp("dispatch_started_at"),
  currentOfferedChauffeurId: varchar("current_offered_chauffeur_id").references(() => chauffeurs.id),
  currentOfferExpiresAt: timestamp("current_offer_expires_at"),
  acceptedAt: timestamp("accepted_at"),
  tripStartedAt: timestamp("trip_started_at"),
  cancelledBy: text("cancelled_by"),
  cancellationFee: real("cancellation_fee").notNull().default(0),
  surgeMultiplier: real("surge_multiplier").default(1),
  surgeReason: text("surge_reason"),
  estimatedDurationMin: real("estimated_duration_min"),
  actualDurationMin: real("actual_duration_min"),
  perMinuteAdjustment: real("per_minute_adjustment").default(0),
  paymentMethod: text("payment_method").default("cash"),
  paymentStatus: text("payment_status").notNull().default("unpaid"), // unpaid|pending|paid|failed|refunded
  cashSelfieUrl: text("cash_selfie_url"),
  livenessStatus: text("liveness_status").default("not_required"), // not_required|pending|passed|failed
  livenessProvider: text("liveness_provider"),
  livenessSessionId: varchar("liveness_session_id"),
  livenessScore: real("liveness_score"),
  livenessVerifiedAt: timestamp("liveness_verified_at"),
  // Route selection (set when driver picks fastest/shortest/least-traffic route)
  selectedRouteId: text("selected_route_id"),
  selectedRouteDistanceKm: real("selected_route_distance_km"),
  actualFare: real("actual_fare"),
  demandMultiplier: real("demand_multiplier").notNull().default(1),
  quotedFare: real("quoted_fare"),
  finalFare: real("final_fare"),
  actualDistanceKm: real("actual_distance_km"),
  waitingFee: real("waiting_fee").notNull().default(0),
  settlementStatus: text("settlement_status").notNull().default("quoted"),
  pickupTravelStartedAt: timestamp("pickup_travel_started_at"),
  arrivedAt: timestamp("arrived_at"),
  routeCurrency: text("route_currency").default("ZAR"),
  routeSelectedAt: timestamp("route_selected_at"),
  rewardsAmountUsed: real("rewards_amount_used").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const livenessSessions = pgTable("liveness_sessions", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  provider: text("provider").notNull().default("mock"),
  status: text("status").notNull().default("pending"), // pending|passed|failed|expired
  challengeCode: text("challenge_code").notNull(),
  selfieUrl: text("selfie_url"),
  verifiedPhotoUrl: text("verified_photo_url"),
  rideId: varchar("ride_id"),
  score: real("score"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorReason: text("error_reason"),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id")
    .notNull()
    .references(() => rides.id),
  payerUserId: varchar("payer_user_id")
    .notNull()
    .references(() => users.id),
  amount: real("amount").notNull(),
  method: text("method").notNull().default("cash"),
  status: text("status").notNull().default("pending"), // pending|paid|failed|refunded
  currency: text("currency").default("ZAR"),
  provider: text("provider"),
  providerRef: text("provider_ref"),
  paystackReference: varchar("paystack_reference"),
  paystackAuthCode: text("paystack_auth_code"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const driverApplications = pgTable("driver_applications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  chauffeurId: varchar("chauffeur_id").references(() => chauffeurs.id),
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  notes: text("notes"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
});

export const operatorProfiles = pgTable("operator_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partnerProfiles = pgTable("partner_profiles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  operatorProfileId: varchar("operator_profile_id")
    .notNull()
    .unique()
    .references(() => operatorProfiles.id),
  companyName: text("company_name").notNull(),
  registrationNumber: text("registration_number").notNull(),
  contactPersonName: text("contact_person_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email").notNull(),
  bankName: text("bank_name").notNull(),
  accountHolder: text("account_holder").notNull(),
  accountNumber: text("account_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerOperatorProfileId: varchar("owner_operator_profile_id")
    .notNull()
    .references(() => operatorProfiles.id),
  status: text("status").notNull().default("draft"),
  carMake: text("car_make").notNull(),
  vehicleModel: text("vehicle_model").notNull(),
  vehicleYear: integer("vehicle_year").notNull(),
  plateNumber: text("plate_number").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  carColor: text("car_color").notNull(),
  passengerCapacity: integer("passenger_capacity").default(4),
  luggageCapacity: integer("luggage_capacity").default(2),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehicleAssignments = pgTable("vehicle_assignments", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  vehicleId: varchar("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  driverOperatorProfileId: varchar("driver_operator_profile_id")
    .notNull()
    .references(() => operatorProfiles.id),
  assignedByOperatorProfileId: varchar("assigned_by_operator_profile_id")
    .notNull()
    .references(() => operatorProfiles.id),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  removedAt: timestamp("removed_at"),
});

export const fleetDriverInvites = pgTable("fleet_driver_invites", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  driverOperatorProfileId: varchar("driver_operator_profile_id")
    .notNull()
    .references(() => operatorProfiles.id),
  invitedByOperatorProfileId: varchar("invited_by_operator_profile_id")
    .notNull()
    .references(() => operatorProfiles.id),
  invitedByUserId: varchar("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  status: text("status").notNull().default("pending"),
  emailStatus: text("email_status").notNull().default("queued"),
  emailError: text("email_error"),
  message: text("message"),
  resendId: text("resend_id"),
  sentAt: timestamp("sent_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  requestedAt: timestamp("requested_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const liftClubRoutes = pgTable("lift_club_routes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  vehicleId: varchar("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
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
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  routeId: varchar("route_id")
    .notNull()
    .references(() => liftClubRoutes.id),
  riderId: varchar("rider_id")
    .notNull()
    .references(() => users.id),
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

export const documents = pgTable("documents", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  applicationId: varchar("application_id").references(() => driverApplications.id),
  chauffeurId: varchar("chauffeur_id").references(() => chauffeurs.id),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id),
  type: text("type").notNull(),
  url: text("url").notNull(),
  status: text("status").notNull().default("pending"),
  reviewReason: text("review_reason"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewerAdminId: varchar("reviewer_admin_id").references(() => users.id),
});

export const rideRatings = pgTable("ride_ratings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id")
    .notNull()
    .references(() => rides.id),
  clientId: varchar("client_id")
    .notNull()
    .references(() => users.id),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const earnings = pgTable("earnings", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  rideId: varchar("ride_id").references(() => rides.id),
  amount: real("amount").notNull(),
  commission: real("commission").notNull(),
  type: text("type"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const withdrawals = pgTable("withdrawals", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  chauffeurId: varchar("chauffeur_id")
    .notNull()
    .references(() => chauffeurs.id),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountHolder: text("account_holder"),
  paystackTransferCode: varchar("paystack_transfer_code"),
  paystackRecipientCode: varchar("paystack_recipient_code"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id")
    .notNull()
    .references(() => rides.id),
  senderId: varchar("sender_id")
    .notNull()
    .references(() => users.id),
  messageText: text("message_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const safetyReports = pgTable("safety_reports", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  rideId: varchar("ride_id").references(() => rides.id),
  type: text("type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  aiResponse: text("ai_response"),
  priority: text("priority").default("medium"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("general"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tripEnquiries = pgTable("trip_enquiries", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  rideId: varchar("ride_id")
    .notNull()
    .references(() => rides.id),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id),
  message: text("message").notNull(),
  adminReply: text("admin_reply"),
  status: text("status").notNull().default("open"), // open | replied | closed
  createdAt: timestamp("created_at").defaultNow(),
  repliedAt: timestamp("replied_at"),
});

export const savedCards = pgTable("saved_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  paystackAuthCode: text("paystack_auth_code").notNull(),
  cardType: text("card_type"),
  last4: varchar("last4", { length: 4 }),
  expMonth: varchar("exp_month", { length: 2 }),
  expYear: varchar("exp_year", { length: 4 }),
  bank: text("bank"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  balanceBefore: real("balance_before").notNull(),
  balanceAfter: real("balance_after").notNull(),
  reference: varchar("reference"),
  description: text("description"),
  rideId: varchar("ride_id"),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SavedCard = typeof savedCards.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  phone: true,
  role: true,
});

export const insertChauffeurSchema = createInsertSchema(chauffeurs).pick({
  userId: true,
  carMake: true,
  vehicleModel: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  phone: true,
  passengerCapacity: true,
  luggageCapacity: true,
});

export const insertRideSchema = createInsertSchema(rides).pick({
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
  livenessVerifiedAt: true,
});

export const insertLivenessSessionSchema = createInsertSchema(livenessSessions).pick({
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
  verifiedAt: true,
});

export const insertOperatorProfileSchema = createInsertSchema(operatorProfiles).pick({
  userId: true,
  type: true,
  status: true,
  rejectionReason: true,
  submittedAt: true,
});

export const insertPartnerProfileSchema = createInsertSchema(partnerProfiles).pick({
  operatorProfileId: true,
  companyName: true,
  registrationNumber: true,
  contactPersonName: true,
  contactPhone: true,
  contactEmail: true,
  bankName: true,
  accountHolder: true,
  accountNumber: true,
});

export const insertVehicleSchema = createInsertSchema(vehicles).pick({
  ownerOperatorProfileId: true,
  status: true,
  carMake: true,
  vehicleModel: true,
  vehicleYear: true,
  plateNumber: true,
  vehicleType: true,
  carColor: true,
  passengerCapacity: true,
  luggageCapacity: true,
});

export const insertVehicleAssignmentSchema = createInsertSchema(vehicleAssignments).pick({
  vehicleId: true,
  driverOperatorProfileId: true,
  assignedByOperatorProfileId: true,
  status: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Chauffeur = typeof chauffeurs.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type LivenessSession = typeof livenessSessions.$inferSelect;
export type DriverApplication = typeof driverApplications.$inferSelect;
export type OperatorProfile = typeof operatorProfiles.$inferSelect;
export type PartnerProfile = typeof partnerProfiles.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleAssignment = typeof vehicleAssignments.$inferSelect;
export type FleetDriverInvite = typeof fleetDriverInvites.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type LiftClubRoute = typeof liftClubRoutes.$inferSelect;
export type LiftClubBooking = typeof liftClubBookings.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type RideRating = typeof rideRatings.$inferSelect;
export type Earning = typeof earnings.$inferSelect;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type SafetyReport = typeof safetyReports.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type TripEnquiry = typeof tripEnquiries.$inferSelect;

// ─── Referral events ──────────────────────────────────────────────────────
export const referralEvents = pgTable("referral_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerUserId: varchar("referrer_user_id").notNull().references(() => users.id),
  referredUserId: varchar("referred_user_id").notNull().unique().references(() => users.id),
  referralCodeUsed: text("referral_code_used").notNull(),
  status: text("status").notNull().default("registered"),
  totalRewards: real("total_rewards").default(0),
  firstRewardAt: timestamp("first_reward_at"),
  lastRewardAt: timestamp("last_reward_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Reward transactions ──────────────────────────────────────────────────
export const rewardTransactions = pgTable("reward_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  referralEventId: varchar("referral_event_id").references(() => referralEvents.id),
  sourceUserId: varchar("source_user_id").references(() => users.id),
  rideId: varchar("ride_id").references(() => rides.id),
  reference: varchar("reference"),
  amount: real("amount").notNull(),
  balanceBefore: real("balance_before").notNull(),
  balanceAfter: real("balance_after").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Reward cashouts ──────────────────────────────────────────────────────
export const rewardCashouts = pgTable("reward_cashouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("requested"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  accountHolder: text("account_holder"),
  phone: text("phone"),
  notes: text("notes"),
  reviewedByAdminId: varchar("reviewed_by_admin_id").references(() => users.id),
  requestedAt: timestamp("requested_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  paidAt: timestamp("paid_at"),
});

export type ReferralEvent = typeof referralEvents.$inferSelect;
export type RewardTransaction = typeof rewardTransactions.$inferSelect;
export type RewardCashout = typeof rewardCashouts.$inferSelect;
