import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, desc, avg, sql, or } from "drizzle-orm";
import {
  users,
  chauffeurs,
  rides,
  payments,
  driverApplications,
  operatorProfiles,
  partnerProfiles,
  vehicles,
  vehicleAssignments,
  fleetDriverInvites,
  liftClubMemberships,
  liftClubRoutes,
  liftClubBookings,
  documents,
  rideRatings,
  earnings,
  withdrawals,
  messages,
  safetyReports,
  notifications,
  tripEnquiries,
  livenessSessions,
  savedCards,
  walletTransactions,
  referralEvents,
  rewardTransactions,
  rewardCashouts,
  type TripEnquiry,
  type User,
  type InsertUser,
  type Chauffeur,
  type Ride,
  type Payment,
  type DriverApplication,
  type OperatorProfile,
  type PartnerProfile,
  type Vehicle,
  type VehicleAssignment,
  type LiftClubRoute,
  type LiftClubBooking,
  type Document,
  type RideRating,
  type Earning,
  type Withdrawal,
  type Message,
  type SafetyReport,
  type Notification,
  type SavedCard,
  type WalletTransaction,
  type LivenessSession,
  type ReferralEvent,
  type RewardTransaction,
  type RewardCashout,
} from "../shared/schema";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL is not set");
}

console.log(`[Storage] Using DB: ${dbUrl.includes("supabase") ? "SUPABASE ✅" : "LOCAL ❌"} | ${dbUrl.replace(/:([^:@]+)@/, ":***@")}`);

const requireSsl = dbUrl.includes("supabase") || dbUrl.includes("neon.tech");
const pool = new Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false,
});

const db = drizzle(pool);

export interface IStorage {
  // Users / Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByReferralCode(referralCode: string): Promise<User | undefined>;
  createUser(user: InsertUser & Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  // Chauffeurs (Drivers)
  getChauffeur(id: string): Promise<Chauffeur | undefined>;
  getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined>;
  createChauffeur(data: any): Promise<Chauffeur>;
  updateChauffeur(id: string, data: Partial<Chauffeur>): Promise<Chauffeur | undefined>;
  deleteChauffeur(id: string): Promise<boolean>;
  getOnlineChauffeurs(): Promise<Chauffeur[]>;
  getAllChauffeurs(): Promise<Chauffeur[]>;

  // Driver Applications + Documents
  createDriverApplication(data: any): Promise<DriverApplication>;
  getDriverApplication(id: string): Promise<DriverApplication | undefined>;
  getDriverApplications(): Promise<DriverApplication[]>;
  getDriverApplicationByUserId(userId: string): Promise<DriverApplication | undefined>;
  updateDriverApplication(
    id: string,
    data: Partial<DriverApplication>,
  ): Promise<DriverApplication | undefined>;
  deleteDriverApplication(id: string): Promise<boolean>;

  // Operator Profiles + Fleet
  getOperatorProfile(id: string): Promise<OperatorProfile | undefined>;
  getOperatorProfileByUserId(userId: string): Promise<OperatorProfile | undefined>;
  getOperatorProfiles(filters?: { type?: string; status?: string }): Promise<OperatorProfile[]>;
  createOperatorProfile(data: any): Promise<OperatorProfile>;
  updateOperatorProfile(id: string, data: Partial<OperatorProfile>): Promise<OperatorProfile | undefined>;
  deleteOperatorProfile(id: string): Promise<boolean>;

  getPartnerProfileByOperatorId(operatorProfileId: string): Promise<PartnerProfile | undefined>;
  createPartnerProfile(data: any): Promise<PartnerProfile>;
  updatePartnerProfile(id: string, data: Partial<PartnerProfile>): Promise<PartnerProfile | undefined>;

  getVehicle(id: string): Promise<Vehicle | undefined>;
  getVehiclesByOwnerOperator(ownerOperatorProfileId: string): Promise<Vehicle[]>;
  getVehicles(filters?: { status?: string; ownerOperatorProfileId?: string }): Promise<Vehicle[]>;
  createVehicle(data: any): Promise<Vehicle>;
  updateVehicle(id: string, data: Partial<Vehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: string): Promise<boolean>;

  getActiveVehicleAssignment(vehicleId: string, driverOperatorProfileId: string): Promise<VehicleAssignment | undefined>;
  getVehicleAssignments(filters?: {
    vehicleId?: string;
    driverOperatorProfileId?: string;
    assignedByOperatorProfileId?: string;
    status?: string;
  }): Promise<VehicleAssignment[]>;
  createVehicleAssignment(data: any): Promise<VehicleAssignment>;
  updateVehicleAssignment(id: string, data: Partial<VehicleAssignment>): Promise<VehicleAssignment | undefined>;

  // Daily Lift Club
  searchLiftClubRoutes(filters?: { from?: string; to?: string }): Promise<any[]>;
  getLiftClubRoute(id: string): Promise<any | undefined>;
  getLiftClubRouteByChauffeurId(chauffeurId: string): Promise<any | undefined>;
  getLiftClubRoutes(filters?: { status?: string }): Promise<any[]>;
  upsertLiftClubRoute(data: any): Promise<any>;
  updateLiftClubRouteStatus(chauffeurId: string, status: string): Promise<any | undefined>;
  updateLiftClubRouteStatusById(id: string, status: string): Promise<any | undefined>;
  createLiftClubBooking(data: any): Promise<LiftClubBooking>;
  confirmLiftClubBookingWithSeat(data: any): Promise<LiftClubBooking>;
  getLiftClubBookingsByUser(userId: string): Promise<any[]>;
  getLiftClubMembershipByUser(userId: string): Promise<any | undefined>;
  getLiftClubMembership(id: string): Promise<any | undefined>;
  deleteLiftClubMembership(id: string): Promise<boolean>;
  getLiftClubMemberships(filters?: { status?: string }): Promise<any[]>;
  upsertLiftClubMembership(data: any): Promise<any>;
  updateLiftClubMembership(id: string, data: any): Promise<any | undefined>;

  createDocument(data: any): Promise<Document>;
  getDocumentsByApplication(applicationId: string): Promise<Document[]>;
  getDocumentsByUser(userId: string): Promise<Document[]>;
  getDocumentsByVehicle(vehicleId: string): Promise<Document[]>;
  getAllDocuments(): Promise<Document[]>;
  updateDocument(id: string, data: Partial<Document>): Promise<Document | undefined>;

  // Rides
  createRide(data: any): Promise<Ride>;
  getRide(id: string): Promise<Ride | undefined>;
  updateRide(id: string, data: Partial<Ride>): Promise<Ride | undefined>;
  /** Atomically accepts a ride only if it is still in "requested" or "searching" status.
   *  Returns the updated ride, or undefined if the ride was already taken (race condition guard). */
  acceptRideAtomic(rideId: string, chauffeurId: string, vehicleId?: string | null): Promise<Ride | undefined>;
  getRidesByClient(clientId: string): Promise<Ride[]>;
  getRidesByChauffeur(chauffeurId: string): Promise<Ride[]>;
  getActiveRides(): Promise<Ride[]>;
  getAllRides(): Promise<Ride[]>;

  // Liveness sessions
  createLivenessSession(data: any): Promise<LivenessSession>;
  getLivenessSession(id: string): Promise<LivenessSession | undefined>;
  getLatestPendingLivenessSessionByUser(userId: string): Promise<LivenessSession | undefined>;
  updateLivenessSession(
    id: string,
    data: Partial<LivenessSession>,
  ): Promise<LivenessSession | undefined>;

  // Payments
  createPayment(data: any): Promise<Payment>;
  getAllUsers(): Promise<User[]>;
  getAllPayments(): Promise<Payment[]>;
  getPaymentsByRide(rideId: string): Promise<Payment[]>;
  updatePayment(id: string, data: Partial<Payment>): Promise<Payment | undefined>;

  // Ratings
  createRideRating(data: any): Promise<RideRating>;
  getRatingsByChauffeur(chauffeurId: string): Promise<RideRating[]>;
  getAverageRatingForUser(userId: string): Promise<number | null>;

  // Earnings / withdrawals
  createEarning(data: any): Promise<Earning>;
  getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]>;
  getAllEarnings(): Promise<Earning[]>;

  createWithdrawal(data: any): Promise<Withdrawal>;
  getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]>;
  getAllWithdrawals(): Promise<Withdrawal[]>;
  updateWithdrawal(id: string, data: Partial<Withdrawal>): Promise<Withdrawal | undefined>;

  // Chat
  createMessage(data: any): Promise<Message>;
  getMessagesByRide(rideId: string): Promise<Message[]>;

  // Safety + Notifications
  createSafetyReport(data: any): Promise<SafetyReport>;
  getSafetyReportsByUser(userId: string): Promise<SafetyReport[]>;
  getAllSafetyReports(): Promise<SafetyReport[]>;
  updateSafetyReport(
    id: string,
    data: Partial<SafetyReport>,
  ): Promise<SafetyReport | undefined>;

  createNotification(data: any): Promise<Notification>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  deleteAllNotificationsByUser(userId: string): Promise<void>;

  // Saved Cards (Paystack)
  getSavedCard(id: string): Promise<SavedCard | undefined>;
  getSavedCardsByUser(userId: string): Promise<SavedCard[]>;
  createSavedCard(data: any): Promise<SavedCard>;
  updateSavedCard(id: string, data: Partial<SavedCard>): Promise<SavedCard>;
  deleteSavedCard(id: string): Promise<void>;

  // Wallet Transactions
  createWalletTransaction(data: any): Promise<WalletTransaction>;
  getWalletTransactions(userId: string): Promise<WalletTransaction[]>;

  // Referral + Rewards
  createReferralEvent(data: any): Promise<ReferralEvent>;
  getReferralEventByReferredUserId(userId: string): Promise<ReferralEvent | undefined>;
  getReferralEventsByReferrerUserId(userId: string): Promise<ReferralEvent[]>;
  updateReferralEvent(id: string, data: Partial<ReferralEvent>): Promise<ReferralEvent | undefined>;

  createRewardTransaction(data: any): Promise<RewardTransaction>;
  getRewardTransactions(userId: string): Promise<RewardTransaction[]>;
  getRewardTransactionByRideAndType(
    userId: string,
    rideId: string,
    type: string,
    sourceUserId?: string,
  ): Promise<RewardTransaction | undefined>;
  getRewardTransactionByReference(reference: string): Promise<RewardTransaction | undefined>;

  createRewardCashout(data: any): Promise<RewardCashout>;
  getRewardCashout(id: string): Promise<RewardCashout | undefined>;
  getRewardCashoutsByUser(userId: string): Promise<RewardCashout[]>;
  getAllRewardCashouts(): Promise<RewardCashout[]>;
  updateRewardCashout(id: string, data: Partial<RewardCashout>): Promise<RewardCashout | undefined>;

  // Withdrawal (extended)
  updateWithdrawalByTransferCode(transferCode: string, data: any): Promise<Withdrawal | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const normalised = username.toLowerCase().trim();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, normalised));
    return user;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    const code = referralCode.trim().toUpperCase();
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user;
  }

  async createUser(insertUser: InsertUser & Partial<User>): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getChauffeur(id: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db
      .select()
      .from(chauffeurs)
      .where(eq(chauffeurs.id, id));
    return chauffeur;
  }

  async getChauffeurByUserId(userId: string): Promise<Chauffeur | undefined> {
    const [chauffeur] = await db
      .select()
      .from(chauffeurs)
      .where(eq(chauffeurs.userId, userId));
    return chauffeur;
  }

  async createChauffeur(data: any): Promise<Chauffeur> {
    const [chauffeur] = await db.insert(chauffeurs).values(data).returning();
    return chauffeur;
  }

  async updateChauffeur(
    id: string,
    data: Partial<Chauffeur>,
  ): Promise<Chauffeur | undefined> {
    const sanitizedEntries = Object.entries(data || {}).filter(([, value]) => value !== undefined);
    if (sanitizedEntries.length === 0) {
      return this.getChauffeur(id);
    }

    const sanitizedData = Object.fromEntries(sanitizedEntries) as Partial<Chauffeur>;
    const [chauffeur] = await db
      .update(chauffeurs)
      .set(sanitizedData)
      .where(eq(chauffeurs.id, id))
      .returning();
    return chauffeur;
  }

  async deleteChauffeur(id: string): Promise<boolean> {
    const deleted = await db.delete(chauffeurs).where(eq(chauffeurs.id, id)).returning();
    return deleted.length > 0;
  }

  async getOnlineChauffeurs(): Promise<Chauffeur[]> {
    return db
      .select()
      .from(chauffeurs)
      .where(and(eq(chauffeurs.isOnline, true), eq(chauffeurs.isApproved, true)));
  }

  async getAllChauffeurs(): Promise<Chauffeur[]> {
    return db.select().from(chauffeurs).orderBy(desc(chauffeurs.createdAt));
  }

  async createDriverApplication(data: any): Promise<DriverApplication> {
    const [app] = await db
      .insert(driverApplications)
      .values(data)
      .returning();
    return app;
  }

  async getDriverApplication(id: string): Promise<DriverApplication | undefined> {
    const [app] = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.id, id));
    return app;
  }

  async getDriverApplications(): Promise<DriverApplication[]> {
    return db
      .select()
      .from(driverApplications)
      .orderBy(desc(driverApplications.submittedAt));
  }

  async getDriverApplicationByUserId(
    userId: string,
  ): Promise<DriverApplication | undefined> {
    const [app] = await db
      .select()
      .from(driverApplications)
      .where(eq(driverApplications.userId, userId))
      .orderBy(desc(driverApplications.submittedAt));
    return app;
  }

  async updateDriverApplication(
    id: string,
    data: Partial<DriverApplication>,
  ): Promise<DriverApplication | undefined> {
    const [app] = await db
      .update(driverApplications)
      .set(data)
      .where(eq(driverApplications.id, id))
      .returning();
    return app;
  }

  async deleteDriverApplication(id: string): Promise<boolean> {
    const deleted = await db.delete(driverApplications).where(eq(driverApplications.id, id)).returning();
    return deleted.length > 0;
  }

  async getOperatorProfile(id: string): Promise<OperatorProfile | undefined> {
    const [profile] = await db
      .select()
      .from(operatorProfiles)
      .where(eq(operatorProfiles.id, id));
    return profile;
  }

  async getOperatorProfileByUserId(userId: string): Promise<OperatorProfile | undefined> {
    const [profile] = await db
      .select()
      .from(operatorProfiles)
      .where(eq(operatorProfiles.userId, userId));
    return profile;
  }

  async getOperatorProfiles(filters: { type?: string; status?: string } = {}): Promise<OperatorProfile[]> {
    const conditions = [
      filters.type ? eq(operatorProfiles.type, filters.type) : undefined,
      filters.status ? eq(operatorProfiles.status, filters.status) : undefined,
    ].filter(Boolean) as any[];

    if (conditions.length > 0) {
      return db
        .select()
        .from(operatorProfiles)
        .where(and(...conditions))
        .orderBy(desc(operatorProfiles.submittedAt));
    }

    return db.select().from(operatorProfiles).orderBy(desc(operatorProfiles.submittedAt));
  }

  async createOperatorProfile(data: any): Promise<OperatorProfile> {
    const [profile] = await db.insert(operatorProfiles).values(data).returning();
    return profile;
  }

  async updateOperatorProfile(
    id: string,
    data: Partial<OperatorProfile>,
  ): Promise<OperatorProfile | undefined> {
    const [profile] = await db
      .update(operatorProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(operatorProfiles.id, id))
      .returning();
    return profile;
  }

  async deleteOperatorProfile(id: string): Promise<boolean> {
    const profile = await this.getOperatorProfile(id);
    if (!profile) return false;
    const ownedVehicles = await this.getVehiclesByOwnerOperator(id);
    for (const vehicle of ownedVehicles) {
      await this.deleteVehicle(vehicle.id);
    }
    await db
      .delete(vehicleAssignments)
      .where(
        or(
          eq(vehicleAssignments.driverOperatorProfileId, id),
          eq(vehicleAssignments.assignedByOperatorProfileId, id),
        ),
      );
    await db
      .delete(fleetDriverInvites)
      .where(
        or(
          eq(fleetDriverInvites.driverOperatorProfileId, id),
          eq(fleetDriverInvites.invitedByOperatorProfileId, id),
        ),
      );
    await db.delete(partnerProfiles).where(eq(partnerProfiles.operatorProfileId, id));
    await db.delete(documents).where(eq(documents.userId, profile.userId));
    const deleted = await db.delete(operatorProfiles).where(eq(operatorProfiles.id, id)).returning();
    return deleted.length > 0;
  }

  async getPartnerProfileByOperatorId(operatorProfileId: string): Promise<PartnerProfile | undefined> {
    const [profile] = await db
      .select()
      .from(partnerProfiles)
      .where(eq(partnerProfiles.operatorProfileId, operatorProfileId));
    return profile;
  }

  async createPartnerProfile(data: any): Promise<PartnerProfile> {
    const [profile] = await db.insert(partnerProfiles).values(data).returning();
    return profile;
  }

  async updatePartnerProfile(
    id: string,
    data: Partial<PartnerProfile>,
  ): Promise<PartnerProfile | undefined> {
    const [profile] = await db
      .update(partnerProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(partnerProfiles.id, id))
      .returning();
    return profile;
  }

  async getVehicle(id: string): Promise<Vehicle | undefined> {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, id));
    return vehicle;
  }

  async getVehiclesByOwnerOperator(ownerOperatorProfileId: string): Promise<Vehicle[]> {
    return db
      .select()
      .from(vehicles)
      .where(eq(vehicles.ownerOperatorProfileId, ownerOperatorProfileId))
      .orderBy(desc(vehicles.createdAt));
  }

  async getVehicles(filters: { status?: string; ownerOperatorProfileId?: string } = {}): Promise<Vehicle[]> {
    const conditions = [
      filters.status ? eq(vehicles.status, filters.status) : undefined,
      filters.ownerOperatorProfileId ? eq(vehicles.ownerOperatorProfileId, filters.ownerOperatorProfileId) : undefined,
    ].filter(Boolean) as any[];

    if (conditions.length > 0) {
      return db
        .select()
        .from(vehicles)
        .where(and(...conditions))
        .orderBy(desc(vehicles.createdAt));
    }

    return db.select().from(vehicles).orderBy(desc(vehicles.createdAt));
  }

  async createVehicle(data: any): Promise<Vehicle> {
    const [vehicle] = await db.insert(vehicles).values(data).returning();
    return vehicle;
  }

  async updateVehicle(
    id: string,
    data: Partial<Vehicle>,
  ): Promise<Vehicle | undefined> {
    const [vehicle] = await db
      .update(vehicles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vehicles.id, id))
      .returning();
    return vehicle;
  }

  async deleteVehicle(id: string): Promise<boolean> {
    await db.update(chauffeurs).set({ activeVehicleId: null }).where(eq(chauffeurs.activeVehicleId, id));
    await db.delete(documents).where(eq(documents.vehicleId, id));
    await db.delete(vehicleAssignments).where(eq(vehicleAssignments.vehicleId, id));
    const deleted = await db.delete(vehicles).where(eq(vehicles.id, id)).returning();
    return deleted.length > 0;
  }

  async getActiveVehicleAssignment(
    vehicleId: string,
    driverOperatorProfileId: string,
  ): Promise<VehicleAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(vehicleAssignments)
      .where(and(
        eq(vehicleAssignments.vehicleId, vehicleId),
        eq(vehicleAssignments.driverOperatorProfileId, driverOperatorProfileId),
        eq(vehicleAssignments.status, "active"),
      ));
    return assignment;
  }

  async getVehicleAssignments(filters: {
    vehicleId?: string;
    driverOperatorProfileId?: string;
    assignedByOperatorProfileId?: string;
    status?: string;
  } = {}): Promise<VehicleAssignment[]> {
    const conditions = [
      filters.vehicleId ? eq(vehicleAssignments.vehicleId, filters.vehicleId) : undefined,
      filters.driverOperatorProfileId ? eq(vehicleAssignments.driverOperatorProfileId, filters.driverOperatorProfileId) : undefined,
      filters.assignedByOperatorProfileId ? eq(vehicleAssignments.assignedByOperatorProfileId, filters.assignedByOperatorProfileId) : undefined,
      filters.status ? eq(vehicleAssignments.status, filters.status) : undefined,
    ].filter(Boolean) as any[];

    if (conditions.length > 0) {
      return db
        .select()
        .from(vehicleAssignments)
        .where(and(...conditions))
        .orderBy(desc(vehicleAssignments.createdAt));
    }

    return db.select().from(vehicleAssignments).orderBy(desc(vehicleAssignments.createdAt));
  }

  async createVehicleAssignment(data: any): Promise<VehicleAssignment> {
    const [assignment] = await db.insert(vehicleAssignments).values(data).returning();
    return assignment;
  }

  async updateVehicleAssignment(
    id: string,
    data: Partial<VehicleAssignment>,
  ): Promise<VehicleAssignment | undefined> {
    const [assignment] = await db
      .update(vehicleAssignments)
      .set(data)
      .where(eq(vehicleAssignments.id, id))
      .returning();
    return assignment;
  }

  private async enrichLiftClubRoute(route: LiftClubRoute): Promise<any | undefined> {
    const [chauffeur, vehicle] = await Promise.all([
      this.getChauffeur(route.chauffeurId),
      this.getVehicle(route.vehicleId),
    ]);
    if (!chauffeur || !vehicle) return undefined;
    if (!chauffeur.isApproved) return undefined;
    if (vehicle.status !== "approved") return undefined;
    if (Number(vehicle.vehicleYear || 0) < 2015) return undefined;
    const driver = chauffeur.userId ? await this.getUser(chauffeur.userId) : undefined;
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
      chauffeurUserId: chauffeur.userId,
    };
  }

  async searchLiftClubRoutes(filters: { from?: string; to?: string } = {}): Promise<any[]> {
    const normalizedFrom = String(filters.from || "").trim().toLowerCase();
    const normalizedTo = String(filters.to || "").trim().toLowerCase();
    const rows = await db
      .select()
      .from(liftClubRoutes)
      .where(eq(liftClubRoutes.status, "active"))
      .orderBy(desc(liftClubRoutes.createdAt));
    const enriched = await Promise.all(rows.map((route) => this.enrichLiftClubRoute(route)));
    return enriched
      .filter(Boolean)
      .filter((route: any) => {
        const fromOk = !normalizedFrom || String(route.pickupArea || "").toLowerCase().includes(normalizedFrom);
        const toOk = !normalizedTo || String(route.destinationArea || "").toLowerCase().includes(normalizedTo);
        return fromOk && toOk;
      });
  }

  async getLiftClubRoute(id: string): Promise<any | undefined> {
    const [route] = await db.select().from(liftClubRoutes).where(eq(liftClubRoutes.id, id));
    return route ? this.enrichLiftClubRoute(route) : undefined;
  }

  async getLiftClubRouteByChauffeurId(chauffeurId: string): Promise<any | undefined> {
    const [route] = await db
      .select()
      .from(liftClubRoutes)
      .where(eq(liftClubRoutes.chauffeurId, chauffeurId))
      .orderBy(desc(liftClubRoutes.updatedAt));
    return route ? this.enrichLiftClubRoute(route) : undefined;
  }

  async getLiftClubRoutes(filters: { status?: string } = {}): Promise<any[]> {
    const rows = await db
      .select()
      .from(liftClubRoutes)
      .where(filters.status && filters.status !== "all" ? eq(liftClubRoutes.status, filters.status) : sql`true`)
      .orderBy(desc(liftClubRoutes.updatedAt), desc(liftClubRoutes.createdAt));
    const enriched = await Promise.all(rows.map((route) => this.enrichLiftClubRoute(route)));
    return enriched.filter(Boolean);
  }

  async upsertLiftClubRoute(data: any): Promise<any> {
    const [existing] = await db
      .select()
      .from(liftClubRoutes)
      .where(eq(liftClubRoutes.chauffeurId, data.chauffeurId))
      .orderBy(desc(liftClubRoutes.updatedAt));

    if (existing) {
      const [route] = await db
        .update(liftClubRoutes)
        .set({
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
          bookedSeats: sql`LEAST(${liftClubRoutes.bookedSeats}, ${Number(data.totalSeats)})` as any,
          status: data.status || "active",
          updatedAt: new Date(),
        } as any)
        .where(eq(liftClubRoutes.id, existing.id))
        .returning();
      return this.enrichLiftClubRoute(route);
    }

    const [route] = await db.insert(liftClubRoutes).values(data).returning();
    return this.enrichLiftClubRoute(route);
  }

  async updateLiftClubRouteStatus(chauffeurId: string, status: string): Promise<any | undefined> {
    const [route] = await db
      .update(liftClubRoutes)
      .set({ status, updatedAt: new Date() })
      .where(eq(liftClubRoutes.chauffeurId, chauffeurId))
      .returning();
    return route ? this.enrichLiftClubRoute(route) : undefined;
  }

  async updateLiftClubRouteStatusById(id: string, status: string): Promise<any | undefined> {
    const [route] = await db
      .update(liftClubRoutes)
      .set({ status, updatedAt: new Date() })
      .where(eq(liftClubRoutes.id, id))
      .returning();
    return route ? this.enrichLiftClubRoute(route) : undefined;
  }

  async createLiftClubBooking(data: any): Promise<LiftClubBooking> {
    const [booking] = await db.insert(liftClubBookings).values(data).returning();
    return booking;
  }

  async confirmLiftClubBookingWithSeat(data: any): Promise<LiftClubBooking> {
    return db.transaction(async (tx) => {
      const [updatedRoute] = await tx
        .update(liftClubRoutes)
        .set({
          bookedSeats: sql`${liftClubRoutes.bookedSeats} + ${Number(data.seatCount || 1)}`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(liftClubRoutes.id, data.routeId),
          eq(liftClubRoutes.status, "active"),
          sql`${liftClubRoutes.bookedSeats} + ${Number(data.seatCount || 1)} <= ${liftClubRoutes.totalSeats}`,
        ))
        .returning();
      if (!updatedRoute) {
        throw new Error("This lift club car is already full.");
      }
      const [booking] = await tx
        .insert(liftClubBookings)
        .values({
          ...data,
          paymentStatus: data.paymentStatus || "paid",
          bookingStatus: data.bookingStatus || "confirmed",
          confirmedAt: data.confirmedAt || new Date(),
        })
        .returning();
      return booking;
    });
  }

  async getLiftClubBookingsByUser(userId: string): Promise<any[]> {
    const bookings = await db
      .select()
      .from(liftClubBookings)
      .where(eq(liftClubBookings.riderId, userId))
      .orderBy(desc(liftClubBookings.createdAt));
    const routes = await Promise.all(bookings.map((booking) => this.getLiftClubRoute(booking.routeId).catch(() => undefined)));
    return bookings.map((booking, index) => ({
      ...booking,
      route: routes[index] || null,
    }));
  }

  private mapLiftClubMembership(row: any): any | undefined {
    if (!row) return undefined;
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
      user: row.user_name || row.user_username || row.user_phone || row.user_role
        ? {
            id: row.user_id,
            name: row.user_name,
            username: row.user_username,
            phone: row.user_phone,
            role: row.user_role,
          }
        : undefined,
      proofDocument: row.document_id
        ? {
            id: row.document_id,
            type: row.document_type,
            url: row.document_url,
            status: row.document_status,
            reviewReason: row.document_review_reason,
            uploadedAt: row.document_uploaded_at,
          }
        : null,
    };
  }

  private liftClubMembershipSelect(whereSql = "", values: any[] = []): Promise<any[]> {
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
      values,
    ).then((result) => result.rows);
  }

  async getLiftClubMembershipByUser(userId: string): Promise<any | undefined> {
    const rows = await this.liftClubMembershipSelect("WHERE m.user_id = $1", [userId]);
    return this.mapLiftClubMembership(rows[0]);
  }

  async getLiftClubMembership(id: string): Promise<any | undefined> {
    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
    return this.mapLiftClubMembership(rows[0]);
  }

  async deleteLiftClubMembership(id: string): Promise<boolean> {
    const deleted = await db
      .delete(liftClubMemberships)
      .where(eq(liftClubMemberships.id, id))
      .returning({ id: liftClubMemberships.id });
    return deleted.length > 0;
  }

  async getLiftClubMemberships(filters: { status?: string } = {}): Promise<any[]> {
    const rows = filters.status
      ? await this.liftClubMembershipSelect("WHERE m.status = $1", [filters.status])
      : await this.liftClubMembershipSelect();
    return rows.map((row) => this.mapLiftClubMembership(row));
  }

  async upsertLiftClubMembership(data: any): Promise<any> {
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
        data.reviewerAdminId ?? null,
      ],
    );
    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [result.rows[0].id]);
    return this.mapLiftClubMembership(rows[0]);
  }

  async updateLiftClubMembership(id: string, data: any): Promise<any | undefined> {
    const fieldMap: Record<string, string> = {
      status: "status",
      feeAmount: "fee_amount",
      proofDocumentId: "proof_document_id",
      rejectionReason: "rejection_reason",
      submittedAt: "submitted_at",
      paidAt: "paid_at",
      reviewedAt: "reviewed_at",
      reviewerAdminId: "reviewer_admin_id",
    };
    const entries = Object.entries(fieldMap).filter(([key]) => Object.prototype.hasOwnProperty.call(data, key));
    if (entries.length === 0) {
      const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
      return this.mapLiftClubMembership(rows[0]);
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
      values,
    );

    const rows = await this.liftClubMembershipSelect("WHERE m.id = $1", [id]);
    return this.mapLiftClubMembership(rows[0]);
  }

  async createDocument(data: any): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async getDocumentsByApplication(applicationId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, applicationId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocumentsByUser(userId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getDocumentsByVehicle(vehicleId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.vehicleId, vehicleId))
      .orderBy(desc(documents.uploadedAt));
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async updateDocument(
    id: string,
    data: Partial<Document>,
  ): Promise<Document | undefined> {
    const [doc] = await db
      .update(documents)
      .set(data)
      .where(eq(documents.id, id))
      .returning();
    return doc;
  }

  async createRide(data: any): Promise<Ride> {
    const [ride] = await db.insert(rides).values(data).returning();
    return ride;
  }

  async getRide(id: string): Promise<Ride | undefined> {
    const [ride] = await db.select().from(rides).where(eq(rides.id, id));
    return ride;
  }

  async updateRide(id: string, data: Partial<Ride>): Promise<Ride | undefined> {
    const [ride] = await db
      .update(rides)
      .set(data)
      .where(eq(rides.id, id))
      .returning();
    return ride;
  }

  /** Atomically accepts a ride — the UPDATE only fires when the ride is still in an
   *  acceptable state, preventing two drivers from claiming the same trip. */
  async acceptRideAtomic(rideId: string, chauffeurId: string, vehicleId?: string | null): Promise<Ride | undefined> {
    const [ride] = await db
      .update(rides)
      .set({
        chauffeurId,
        vehicleId: vehicleId || null,
        status: "chauffeur_assigned",
        acceptedAt: new Date(),
      } as any)
      .where(
        and(
          eq(rides.id, rideId),
          sql`${rides.status} IN ('requested', 'searching')`,
          eq(rides.currentOfferedChauffeurId, chauffeurId),
          sql`${rides.currentOfferExpiresAt} > now()`
        )
      )
      .returning();
    return ride; // undefined means another driver already grabbed it
  }

  async getRidesByClient(clientId: string): Promise<Ride[]> {
    return db
      .select()
      .from(rides)
      .where(eq(rides.clientId, clientId))
      .orderBy(desc(rides.createdAt));
  }

  async getRidesByChauffeur(chauffeurId: string): Promise<Ride[]> {
    return db
      .select()
      .from(rides)
      .where(eq(rides.chauffeurId, chauffeurId))
      .orderBy(desc(rides.createdAt));
  }

  async getActiveRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async getAllRides(): Promise<Ride[]> {
    return db.select().from(rides).orderBy(desc(rides.createdAt));
  }

  async createLivenessSession(data: any): Promise<LivenessSession> {
    const [session] = await db.insert(livenessSessions).values(data).returning();
    return session;
  }

  async getLivenessSession(id: string): Promise<LivenessSession | undefined> {
    const [session] = await db
      .select()
      .from(livenessSessions)
      .where(eq(livenessSessions.id, id));
    return session;
  }

  async getLatestPendingLivenessSessionByUser(
    userId: string,
  ): Promise<LivenessSession | undefined> {
    const [session] = await db
      .select()
      .from(livenessSessions)
      .where(and(eq(livenessSessions.userId, userId), eq(livenessSessions.status, "pending")))
      .orderBy(desc(livenessSessions.createdAt));
    return session;
  }

  async updateLivenessSession(
    id: string,
    data: Partial<LivenessSession>,
  ): Promise<LivenessSession | undefined> {
    // Drizzle's PgTimestamp requires real Date objects — coerce any strings that
    // may have leaked through JSON serialisation back to Date instances.
    const safe: Record<string, unknown> = { ...data };
    for (const key of ["verifiedAt", "expiresAt", "createdAt", "updatedAt"] as const) {
      if (safe[key] !== null && safe[key] !== undefined && !(safe[key] instanceof Date)) {
        safe[key] = new Date(safe[key] as string);
      }
    }
    const [session] = await db
      .update(livenessSessions)
      .set({ ...safe, updatedAt: new Date() })
      .where(eq(livenessSessions.id, id))
      .returning();
    return session;
  }

  async createPayment(data: any): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPaymentsByRide(rideId: string): Promise<Payment[]> {
    return db
      .select()
      .from(payments)
      .where(eq(payments.rideId, rideId))
      .orderBy(desc(payments.createdAt));
  }

  async updatePayment(id: string, data: Partial<Payment>): Promise<Payment | undefined> {
    const [payment] = await db
      .update(payments)
      .set(data)
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }

  async createRideRating(data: any): Promise<RideRating> {
    const [rating] = await db.insert(rideRatings).values(data).returning();
    return rating;
  }

  async getRatingsByChauffeur(chauffeurId: string): Promise<RideRating[]> {
    return db
      .select()
      .from(rideRatings)
      .where(eq(rideRatings.chauffeurId, chauffeurId))
      .orderBy(desc(rideRatings.createdAt));
  }

  async getAverageRatingForUser(userId: string): Promise<number | null> {
    // Average based on all ratings where the rated chauffeur belongs to the userId.
    const chauffeur = await this.getChauffeurByUserId(userId);
    if (!chauffeur) return null;
    const [row] = await db
      .select({ value: avg(rideRatings.rating) })
      .from(rideRatings)
      .where(eq(rideRatings.chauffeurId, chauffeur.id));
    const value = (row?.value as unknown as number | null) ?? null;
    return value;
  }

  async createEarning(data: any): Promise<Earning> {
    const [earning] = await db.insert(earnings).values(data).returning();
    return earning;
  }

  async getEarningsByChauffeur(chauffeurId: string): Promise<Earning[]> {
    return db
      .select()
      .from(earnings)
      .where(eq(earnings.chauffeurId, chauffeurId))
      .orderBy(desc(earnings.createdAt));
  }

  async getAllEarnings(): Promise<Earning[]> {
    return db.select().from(earnings).orderBy(desc(earnings.createdAt));
  }

  async createWithdrawal(data: any): Promise<Withdrawal> {
    const [withdrawal] = await db.insert(withdrawals).values(data).returning();
    return withdrawal;
  }

  async getWithdrawalsByChauffeur(chauffeurId: string): Promise<Withdrawal[]> {
    return db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.chauffeurId, chauffeurId))
      .orderBy(desc(withdrawals.createdAt));
  }

  async getAllWithdrawals(): Promise<Withdrawal[]> {
    return db.select().from(withdrawals).orderBy(desc(withdrawals.createdAt));
  }

  async updateWithdrawal(
    id: string,
    data: Partial<Withdrawal>,
  ): Promise<Withdrawal | undefined> {
    const [withdrawal] = await db
      .update(withdrawals)
      .set(data)
      .where(eq(withdrawals.id, id))
      .returning();
    return withdrawal;
  }

  async createMessage(data: any): Promise<Message> {
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }

  async getMessagesByRide(rideId: string): Promise<Message[]> {
    return db
      .select()
      .from(messages)
      .where(eq(messages.rideId, rideId))
      .orderBy(messages.createdAt);
  }

  async createSafetyReport(data: any): Promise<SafetyReport> {
    const [report] = await db.insert(safetyReports).values(data).returning();
    return report;
  }

  async getSafetyReportsByUser(userId: string): Promise<SafetyReport[]> {
    return db
      .select()
      .from(safetyReports)
      .where(eq(safetyReports.userId, userId))
      .orderBy(desc(safetyReports.createdAt));
  }

  async getAllSafetyReports(): Promise<SafetyReport[]> {
    return db.select().from(safetyReports).orderBy(desc(safetyReports.createdAt));
  }

  async updateSafetyReport(
    id: string,
    data: Partial<SafetyReport>,
  ): Promise<SafetyReport | undefined> {
    const [report] = await db
      .update(safetyReports)
      .set(data)
      .where(eq(safetyReports.id, id))
      .returning();
    return report;
  }

  async createNotification(data: any): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(data)
      .returning();
    return notification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async deleteAllNotificationsByUser(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  }

  async getSavedCard(id: string): Promise<SavedCard | undefined> {
    const [card] = await db.select().from(savedCards).where(eq(savedCards.id, id));
    return card;
  }

  async getSavedCardsByUser(userId: string): Promise<SavedCard[]> {
    return db.select().from(savedCards)
      .where(eq(savedCards.userId, userId))
      .orderBy(desc(savedCards.createdAt));
  }

  async createSavedCard(data: any): Promise<SavedCard> {
    const [card] = await db.insert(savedCards).values(data).returning();
    return card;
  }

  async updateSavedCard(id: string, data: Partial<SavedCard>): Promise<SavedCard> {
    const [card] = await db.update(savedCards).set(data).where(eq(savedCards.id, id)).returning();
    return card;
  }

  async deleteSavedCard(id: string): Promise<void> {
    await db.delete(savedCards).where(eq(savedCards.id, id));
  }

  async createWalletTransaction(data: any): Promise<WalletTransaction> {
    const [tx] = await db.insert(walletTransactions).values(data).returning();
    return tx;
  }

  async getWalletTransactions(userId: string): Promise<WalletTransaction[]> {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);
  }

  async createReferralEvent(data: any): Promise<ReferralEvent> {
    const [event] = await db.insert(referralEvents).values(data).returning();
    return event;
  }

  async getReferralEventByReferredUserId(userId: string): Promise<ReferralEvent | undefined> {
    const [event] = await db
      .select()
      .from(referralEvents)
      .where(eq(referralEvents.referredUserId, userId));
    return event;
  }

  async getReferralEventsByReferrerUserId(userId: string): Promise<ReferralEvent[]> {
    return db
      .select()
      .from(referralEvents)
      .where(eq(referralEvents.referrerUserId, userId))
      .orderBy(desc(referralEvents.createdAt));
  }

  async updateReferralEvent(id: string, data: Partial<ReferralEvent>): Promise<ReferralEvent | undefined> {
    const [event] = await db
      .update(referralEvents)
      .set(data)
      .where(eq(referralEvents.id, id))
      .returning();
    return event;
  }

  async createRewardTransaction(data: any): Promise<RewardTransaction> {
    const [tx] = await db.insert(rewardTransactions).values(data).returning();
    return tx;
  }

  async getRewardTransactions(userId: string): Promise<RewardTransaction[]> {
    return db
      .select()
      .from(rewardTransactions)
      .where(eq(rewardTransactions.userId, userId))
      .orderBy(desc(rewardTransactions.createdAt))
      .limit(100);
  }

  async getRewardTransactionByRideAndType(
    userId: string,
    rideId: string,
    type: string,
    sourceUserId?: string,
  ): Promise<RewardTransaction | undefined> {
    const conditions = [
      eq(rewardTransactions.userId, userId),
      eq(rewardTransactions.rideId, rideId),
      eq(rewardTransactions.type, type),
    ];
    if (sourceUserId) {
      conditions.push(eq(rewardTransactions.sourceUserId, sourceUserId));
    }
    const [tx] = await db
      .select()
      .from(rewardTransactions)
      .where(and(...conditions));
    return tx;
  }

  async getRewardTransactionByReference(reference: string): Promise<RewardTransaction | undefined> {
    const [tx] = await db
      .select()
      .from(rewardTransactions)
      .where(eq(rewardTransactions.reference, reference));
    return tx;
  }

  async createRewardCashout(data: any): Promise<RewardCashout> {
    const [cashout] = await db.insert(rewardCashouts).values(data).returning();
    return cashout;
  }

  async getRewardCashout(id: string): Promise<RewardCashout | undefined> {
    const [cashout] = await db.select().from(rewardCashouts).where(eq(rewardCashouts.id, id));
    return cashout;
  }

  async getRewardCashoutsByUser(userId: string): Promise<RewardCashout[]> {
    return db
      .select()
      .from(rewardCashouts)
      .where(eq(rewardCashouts.userId, userId))
      .orderBy(desc(rewardCashouts.requestedAt));
  }

  async getAllRewardCashouts(): Promise<RewardCashout[]> {
    return db.select().from(rewardCashouts).orderBy(desc(rewardCashouts.requestedAt));
  }

  async updateRewardCashout(id: string, data: Partial<RewardCashout>): Promise<RewardCashout | undefined> {
    const [cashout] = await db
      .update(rewardCashouts)
      .set(data)
      .where(eq(rewardCashouts.id, id))
      .returning();
    return cashout;
  }

  async updateWithdrawalByTransferCode(transferCode: string, data: any): Promise<Withdrawal | undefined> {
    const [w] = await db.update(withdrawals)
      .set(data)
      .where(eq(withdrawals.paystackTransferCode, transferCode))
      .returning();
    return w;
  }

  async createTripEnquiry(data: { rideId: string; userId: string; message: string }): Promise<TripEnquiry> {
    const [enquiry] = await db.insert(tripEnquiries).values(data).returning();
    return enquiry;
  }

  async getAllTripEnquiries(): Promise<TripEnquiry[]> {
    return db.select().from(tripEnquiries).orderBy(desc(tripEnquiries.createdAt));
  }

  async replyToTripEnquiry(id: string, adminReply: string): Promise<TripEnquiry | undefined> {
    const [enquiry] = await db
      .update(tripEnquiries)
      .set({ adminReply, status: "replied", repliedAt: new Date() })
      .where(eq(tripEnquiries.id, id))
      .returning();
    return enquiry;
  }

  // ── Admin hard-delete helpers ────────────────────────────────────────────────

  async deleteRide(id: string): Promise<boolean> {
    const deleted = await db.delete(rides).where(eq(rides.id, id)).returning();
    return deleted.length > 0;
  }

  async deleteUser(id: string): Promise<boolean> {
    const deleted = await db.delete(users).where(eq(users.id, id)).returning();
    return deleted.length > 0;
  }

  // Hard-delete a user together with every row that references them, in FK
  // dependency order, inside a single transaction. This is what the admin
  // "delete user" action uses so a driver/partner account (which owns an
  // operator_profile + vehicles) can be removed without hitting foreign-key
  // constraint violations. Either the whole delete succeeds or nothing changes.
  async deleteUserCascade(id: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const profRes = await client.query(
        "SELECT id FROM operator_profiles WHERE user_id = $1",
        [id],
      );
      const profileIds: string[] = profRes.rows.map((r: any) => r.id);

      let vehicleIds: string[] = [];
      if (profileIds.length) {
        const vehRes = await client.query(
          "SELECT id FROM vehicles WHERE owner_operator_profile_id = ANY($1)",
          [profileIds],
        );
        vehicleIds = vehRes.rows.map((r: any) => r.id);
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

      // Rows that directly reference this user
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

      // Soft references — keep the row, drop the pointer to this user
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

  async deleteWithdrawal(id: string): Promise<boolean> {
    const deleted = await db.delete(withdrawals).where(eq(withdrawals.id, id)).returning();
    return deleted.length > 0;
  }

  async deleteSafetyReport(id: string): Promise<boolean> {
    const deleted = await db.delete(safetyReports).where(eq(safetyReports.id, id)).returning();
    return deleted.length > 0;
  }

  async deletePayment(id: string): Promise<boolean> {
    const deleted = await db.delete(payments).where(eq(payments.id, id)).returning();
    return deleted.length > 0;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const deleted = await db.delete(documents).where(eq(documents.id, id)).returning();
    return deleted.length > 0;
  }
}

export const storage = new DatabaseStorage();
