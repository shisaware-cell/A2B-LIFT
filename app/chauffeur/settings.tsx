import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, Modal, Alert, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { uploadDocument } from "@/lib/supabase-storage";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";

interface DriverReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewerName: string;
  createdAt: string;
}

interface DriverProfileSummary {
  driverRating: number | null;
  totalRatings: number;
  completedTrips: number;
  ratings: DriverReview[];
}

export default function ChauffeurSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [showVehicle, setShowVehicle] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showApplicationStatus, setShowApplicationStatus] = useState(false);
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [chauffeur, setChauffeur] = useState<any>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfileSummary | null>(null);
  const [driverProfileLoading, setDriverProfileLoading] = useState(false);

  // Fetch driver application status
  const { data: application, refetch: refetchApplication } = useQuery({
    queryKey: ["/api/driver/applications/me"],
    enabled: !!user,
  });

  // Fetch user documents
  const { data: userDocuments, refetch: refetchDocuments } = useQuery({
    queryKey: ["/api/driver/documents"],
    enabled: !!user,
  });

  useEffect(() => {
    loadChauffeur();
  }, []);

  async function loadChauffeur() {
    try {
      const stored = await AsyncStorage.getItem("a2b_chauffeur");
      if (stored) {
        const c = JSON.parse(stored);
        const res = await apiRequest("GET", `/api/chauffeurs/${c.id}`);
        const data = await res.json();
        setChauffeur(data);
        void loadDriverProfile(data.id);
      } else if (user) {
        const res = await apiRequest("GET", `/api/chauffeurs/user/${user.id}`);
        const data = await res.json();
        setChauffeur(data);
        void loadDriverProfile(data.id);
      }
    } catch {}
  }

  async function loadDriverProfile(chauffeurId?: string) {
    if (!chauffeurId) return;
    try {
      setDriverProfileLoading(true);
      const res = await apiRequest("GET", `/api/chauffeurs/${chauffeurId}/profile`);
      const data = await res.json();
      setDriverProfile(data);
    } catch {
      setDriverProfile(null);
    } finally {
      setDriverProfileLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  async function pickAndUploadDocument(type: string) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingDoc(type);
      const asset = result.assets[0];

      let publicUrl: string;
      try {
        publicUrl = await uploadDocument(asset.uri, user!.id, type, {
          fileName: asset.name,
          mimeType: asset.mimeType,
        });
      } catch (uploadErr: any) {
        Alert.alert("Upload Failed", "Could not upload to cloud storage. Please try again.");
        setUploadingDoc(null);
        return;
      }

      // Save the public URL to the database
      const docRes = await apiRequest("POST", "/api/driver/documents", {
        type,
        url: publicUrl,
        chauffeurId: chauffeur?.id || null,
        applicationId: application?.id || null,
      });

      await docRes.json();
      Alert.alert("Success", `${asset.name || type} uploaded successfully. Admin will review it.`);
      refetchDocuments();
      queryClient.invalidateQueries({ queryKey: ["/api/driver/documents"] });
    } catch (error: any) {
      Alert.alert("Upload Failed", error.message || "Failed to upload document");
    } finally {
      setUploadingDoc(null);
    }
  }

  function getDocumentStatus(type: string): "pending" | "approved" | "rejected" | "missing" {
    if (!userDocuments || !Array.isArray(userDocuments)) return "missing";
    const doc = userDocuments.find((d: any) => d.type === type || d.documentType === type);
    if (!doc) return "missing";
    const appStatus = (application as any)?.status;
    if (appStatus === "approved") return "approved";
    if (appStatus === "rejected") return "rejected";
    if (application && appStatus === "pending") return "pending";
    return doc.status as "pending" | "approved" | "rejected";
  }

  function getStatusBadge(status: "pending" | "approved" | "rejected" | "missing") {
    switch (status) {
      case "approved":
        return { bg: styles.docVerified, text: "Verified" };
      case "pending":
        return { bg: styles.docPendingBadge, text: "Pending" };
      case "rejected":
        return { bg: styles.docRejected, text: "Rejected" };
      default:
        return { bg: styles.docMissing, text: "Not Uploaded" };
    }
  }

  const ratingPreview = driverProfile?.ratings?.slice(0, 2) ?? [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          {(chauffeur?.profilePhoto || user?.profilePhoto) ? (
            <Image source={{ uri: chauffeur?.profilePhoto || user?.profilePhoto }} style={styles.avatarImg} />
          ) : (
            <Ionicons name="person" size={28} color={Colors.white} />
          )}
        </View>
        <Text style={styles.profileName}>{user?.name || "Driver"}</Text>
        {user?.email && <Text style={styles.profileEmail}>{user.email}</Text>}
        <Text style={styles.profileRole}>Professional Driver</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={14} color={Colors.warning} />
          {driverProfileLoading ? (
            <ActivityIndicator size="small" color={Colors.warning} />
          ) : (
            <Text style={styles.ratingText}>
              {driverProfile?.driverRating !== null && driverProfile?.driverRating !== undefined
                ? `${driverProfile.driverRating.toFixed(1)} • ${driverProfile.totalRatings} ratings`
                : chauffeur?.computedRating != null
                  ? `${Number(chauffeur.computedRating).toFixed(1)} rating`
                  : "No ratings yet"}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {driverProfile?.driverRating !== null && driverProfile?.driverRating !== undefined
                ? driverProfile.driverRating.toFixed(1)
                : chauffeur?.computedRating != null
                  ? Number(chauffeur.computedRating).toFixed(1)
                  : "—"}
            </Text>
            <Text style={styles.statLabel}>Average Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{driverProfile?.totalRatings ?? chauffeur?.totalRatings ?? 0}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{driverProfile?.completedTrips ?? 0}</Text>
            <Text style={styles.statLabel}>Trips Completed</Text>
          </View>
        </View>
      </View>

      {!!driverProfile?.ratings?.length && (
        <View style={styles.reviewsCard}>
          <Pressable style={styles.reviewsHeader} onPress={() => setShowAllRatings(true)}>
            <Text style={styles.reviewsTitle}>Recent Ratings</Text>
            <View style={styles.reviewsAction}>
              <Text style={styles.reviewsActionText}>All ratings</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </View>
          </Pressable>
          {ratingPreview.map((review) => (
            <View key={review.id} style={styles.reviewItem}>
              <View style={styles.reviewHeader}>
                <Text style={styles.reviewName}>{review.reviewerName}</Text>
                <Text style={styles.reviewMeta}>{review.rating.toFixed(1)} ★</Text>
              </View>
              {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.menuGroup}>
        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowVehicle(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="car-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Vehicle Details</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowDocuments(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="document-text-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Documents</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowApplicationStatus(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="clipboard-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Application Status</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowNotifications(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="notifications-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Notifications</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]} onPress={() => setShowHelp(true)}>
          <View style={styles.menuIconCircle}>
            <Ionicons name="help-circle-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Help & Support</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.menuGroup}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/chauffeur/referrals")}
        >
          <View style={styles.menuIconCircle}>
            <Ionicons name="gift-outline" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Referral & Rewards</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
          onPress={async () => {
            await AsyncStorage.setItem("a2b_last_mode", "client");
            router.replace("/client");
          }}
        >
          <View style={styles.menuIconCircle}>
            <Ionicons name="swap-horizontal" size={20} color={Colors.white} />
          </View>
          <Text style={styles.menuText}>Switch to Client Mode</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color={Colors.error} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </Pressable>

      <View style={styles.brandFooter}>
        <Ionicons name="car-sport" size={14} color={Colors.textMuted} />
        <Text style={styles.brandText}>A2B LIFT v1.0</Text>
      </View>

      <View style={{ height: 100 }} />

      <Modal visible={showVehicle} transparent animationType="slide" onRequestClose={() => setShowVehicle(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowVehicle(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Vehicle Details</Text>
            {chauffeur ? (
              <View style={styles.detailsList}>
                {chauffeur.carMake && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Make</Text>
                    <Text style={styles.detailValue}>{chauffeur.carMake}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Model</Text>
                  <Text style={styles.detailValue}>{chauffeur.vehicleModel}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Plate Number</Text>
                  <Text style={styles.detailValue}>{chauffeur.plateNumber}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{chauffeur.vehicleType}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Color</Text>
                  <Text style={styles.detailValue}>{chauffeur.carColor}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Passengers</Text>
                  <Text style={styles.detailValue}>{chauffeur.passengerCapacity}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Luggage</Text>
                  <Text style={styles.detailValue}>{chauffeur.luggageCapacity}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusChip, chauffeur.isApproved ? styles.statusApproved : styles.statusPending]}>
                    <Text style={styles.statusChipText}>{chauffeur.isApproved ? "Approved" : "Pending Approval"}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.noDataText}>Loading vehicle information...</Text>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showDocuments} transparent animationType="slide" onRequestClose={() => setShowDocuments(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowDocuments(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Documents</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {["driver_license", "vehicle_registration", "insurance", "pdrp_certificate", "criminal_background_check", "driver_photo"].map((type) => {
                const status = getDocumentStatus(type);
                const badge = getStatusBadge(status);
                const DOC_NAMES: Record<string, string> = {
                  driver_license: "Driver's License",
                  vehicle_registration: "Vehicle Registration",
                  insurance: "Liability Insurance",
                  pdrp_certificate: "PrDP Certificate",
                  criminal_background_check: "Background Check",
                  driver_photo: "Driver Photo",
                };
                const DOC_ICONS: Record<string, string> = {
                  driver_license: "id-card",
                  vehicle_registration: "car",
                  insurance: "shield-checkmark",
                  pdrp_certificate: "ribbon",
                  criminal_background_check: "finger-print",
                  driver_photo: "camera",
                };
                const typeName = DOC_NAMES[type] || type.replace(/_/g, " ");
                const icon = DOC_ICONS[type] || "document";
                const isUploading = uploadingDoc === type;
                const docData = Array.isArray(userDocuments) ? userDocuments.find((d: any) => d.type === type || d.documentType === type) : null;

                return (
                  <View key={type} style={styles.docItem}>
                    <Pressable
                      style={[styles.docItemInner, isUploading && { opacity: 0.6 }]}
                      onPress={() => !isUploading && pickAndUploadDocument(type)}
                      disabled={isUploading}
                    >
                      <View style={styles.docIconCircle}>
                        <Ionicons name={icon as any} size={20} color={Colors.white} />
                      </View>
                      <View style={styles.docInfo}>
                        <Text style={styles.docName}>{typeName}</Text>
                        <Text style={styles.docStatus}>{status === "missing" ? "Tap to upload" : "Tap to re-upload"}</Text>
                      </View>
                      {isUploading ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <View style={[styles.docBadge, badge.bg]}>
                          <Text style={styles.docBadgeText}>{badge.text}</Text>
                        </View>
                      )}
                      {status === "missing" && (
                        <Ionicons name="cloud-upload-outline" size={18} color={Colors.textMuted} style={{ marginLeft: 8 }} />
                      )}
                    </Pressable>
                    {docData?.url && (
                      <View style={styles.docPreview}>
                        <Image source={{ uri: docData.url }} style={styles.docPreviewImage} resizeMode="cover" />
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <Text style={styles.docNote}>
              Tap on a document to upload. Images, PDFs, and other document files are supported. Documents are reviewed by our admin team.
            </Text>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showApplicationStatus} transparent animationType="slide" onRequestClose={() => setShowApplicationStatus(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowApplicationStatus(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Application Status</Text>
            {application ? (
              <View style={styles.appStatusContainer}>
                <View style={[styles.statusBadgeLarge, 
                  application.status === "approved" ? styles.statusApprovedLarge :
                  application.status === "rejected" ? styles.statusRejectedLarge :
                  styles.statusPendingLarge
                ]}>
                  <Ionicons 
                    name={application.status === "approved" ? "checkmark-circle" : application.status === "rejected" ? "close-circle" : "time"} 
                    size={32} 
                    color={Colors.white} 
                  />
                  <Text style={styles.statusTextLarge}>
                    {application.status === "approved" ? "Approved" : 
                     application.status === "rejected" ? "Rejected" : 
                     "Pending Review"}
                  </Text>
                </View>
                {application.notes && (
                  <View style={styles.notesCard}>
                    <Text style={styles.notesLabel}>Admin Notes:</Text>
                    <Text style={styles.notesText}>{application.notes}</Text>
                  </View>
                )}
                {application.reviewedAt && (
                  <Text style={styles.reviewedText}>
                    Reviewed on {new Date(application.reviewedAt).toLocaleDateString()}
                  </Text>
                )}
                {!application.reviewedAt && (
                  <Text style={styles.pendingText}>
                    Your application is being reviewed. We'll notify you once a decision is made.
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.appStatusContainer}>
                <Text style={styles.noApplicationText}>No application found. Please complete your driver registration.</Text>
              </View>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowNotifications(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Notification Preferences</Text>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Ride Requests</Text>
                <Text style={styles.notifDesc}>Get notified about new ride requests</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Earnings Updates</Text>
                <Text style={styles.notifDesc}>Notifications about completed trips and payments</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>Withdrawal Status</Text>
                <Text style={styles.notifDesc}>Updates on your withdrawal requests</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
            <View style={styles.notifItem}>
              <View style={styles.notifInfo}>
                <Text style={styles.notifName}>System Announcements</Text>
                <Text style={styles.notifDesc}>Important updates from A2B LIFT</Text>
              </View>
              <View style={styles.notifToggleOn}>
                <Text style={styles.notifToggleText}>ON</Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showHelp} transparent animationType="slide" onRequestClose={() => setShowHelp(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowHelp(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Help & Support</Text>
            <View style={styles.helpCard}>
              <Ionicons name="headset" size={24} color={Colors.white} />
              <View style={styles.helpInfo}>
                <Text style={styles.helpTitle}>Contact Support</Text>
                <Text style={styles.helpDesc}>Our support team is available 24/7</Text>
              </View>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How do I go online?</Text>
              <Text style={styles.faqA}>Toggle the online switch on your dashboard. You must be approved by admin before you can go online.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How are earnings calculated?</Text>
              <Text style={styles.faqA}>You receive 85% of each ride fare. A2B LIFT retains 15% as a commission. Earnings are credited after each completed trip.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>How do withdrawals work?</Text>
              <Text style={styles.faqA}>Request a withdrawal from the Earnings tab. Withdrawals are reviewed by admin and processed within 24-48 hours.</Text>
            </View>
            <View style={styles.faqItem}>
              <Text style={styles.faqQ}>What if a passenger cancels?</Text>
              <Text style={styles.faqA}>If a passenger cancels after you've been assigned, the ride status updates automatically. No charges apply.</Text>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showAllRatings} transparent animationType="slide" onRequestClose={() => setShowAllRatings(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAllRatings(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 16) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>All Ratings</Text>
            {driverProfile ? (
              <>
                <View style={styles.ratingsSummaryRow}>
                  <View style={styles.ratingsSummaryCard}>
                    <Text style={styles.ratingsSummaryValue}>
                      {driverProfile.driverRating !== null && driverProfile.driverRating !== undefined
                        ? driverProfile.driverRating.toFixed(1)
                        : "—"}
                    </Text>
                    <Text style={styles.ratingsSummaryLabel}>Average Rating</Text>
                  </View>
                  <View style={styles.ratingsSummaryCard}>
                    <Text style={styles.ratingsSummaryValue}>{driverProfile.totalRatings}</Text>
                    <Text style={styles.ratingsSummaryLabel}>Total Reviews</Text>
                  </View>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.ratingsList}>
                  {driverProfile.ratings.map((review) => (
                    <View key={review.id} style={styles.reviewItem}>
                      <View style={styles.reviewHeader}>
                        <Text style={styles.reviewName}>{review.reviewerName}</Text>
                        <Text style={styles.reviewMeta}>{review.rating.toFixed(1)} ★</Text>
                      </View>
                      <Text style={styles.reviewDate}>
                        {new Date(review.createdAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" })}
                      </Text>
                      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : <Text style={styles.reviewCommentMuted}>No written feedback</Text>}
                    </View>
                  ))}
                </ScrollView>
              </>
            ) : (
              <Text style={styles.noDataText}>Loading ratings...</Text>
            )}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary, paddingHorizontal: 20 },
  scrollContent: { paddingBottom: 40 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold", color: Colors.white, marginBottom: 20 },
  profileCard: { alignItems: "center", backgroundColor: Colors.card, borderRadius: 20, padding: 28, gap: 6, borderWidth: 1, borderColor: Colors.border, marginBottom: 24 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 6, overflow: "hidden" as const },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
  profileName: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  profileRole: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statBox: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white, textAlign: "center" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: Colors.border },
  reviewsCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: Colors.border, marginBottom: 16, gap: 12 },
  reviewsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reviewsTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewsAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  reviewsActionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  reviewItem: { backgroundColor: Colors.surface, borderRadius: 14, padding: 12, gap: 6, borderWidth: 1, borderColor: Colors.border },
  reviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reviewName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white, flex: 1 },
  reviewMeta: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.warning },
  reviewDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  reviewComment: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  reviewCommentMuted: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textMuted, lineHeight: 18 },
  menuGroup: { backgroundColor: Colors.card, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIconCircle: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  menuText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.white },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, marginTop: 8 },
  logoutText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.error },
  brandFooter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 },
  brandText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14, maxHeight: "80%" },
  sheetHandle: { width: 36, height: 4, backgroundColor: Colors.accent, borderRadius: 2, alignSelf: "center" },
  sheetTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: Colors.white },
  ratingsSummaryRow: { flexDirection: "row", gap: 12 },
  ratingsSummaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  ratingsSummaryValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: Colors.white },
  ratingsSummaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", marginTop: 4 },
  ratingsList: { gap: 12, paddingBottom: 8 },
  detailsList: { gap: 0 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  detailLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusApproved: { backgroundColor: "rgba(76,175,80,0.2)" },
  statusPending: { backgroundColor: "rgba(255,183,77,0.2)" },
  statusChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  noDataText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", padding: 20 },
  docItem: { backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, overflow: "hidden" as const },
  docItemInner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  docPreview: { paddingHorizontal: 14, paddingBottom: 12 },
  docPreviewImage: { width: "100%", height: 120, borderRadius: 8, backgroundColor: Colors.accent },
  docIconCircle: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1, gap: 2 },
  docName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docStatus: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  docBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  docVerified: { backgroundColor: "rgba(76,175,80,0.2)" },
  docPendingBadge: { backgroundColor: "rgba(255,183,77,0.2)" },
  docBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.white },
  docNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", paddingTop: 4 },
  docRejected: { backgroundColor: "rgba(244,67,54,0.2)" },
  docMissing: { backgroundColor: "rgba(158,158,158,0.2)" },
  appStatusContainer: { gap: 16, alignItems: "center" },
  statusBadgeLarge: { alignItems: "center", gap: 8, padding: 24, borderRadius: 16, width: "100%" },
  statusApprovedLarge: { backgroundColor: "rgba(76,175,80,0.2)" },
  statusRejectedLarge: { backgroundColor: "rgba(244,67,54,0.2)" },
  statusPendingLarge: { backgroundColor: "rgba(255,183,77,0.2)" },
  statusTextLarge: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  notesCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, width: "100%", borderWidth: 1, borderColor: Colors.border },
  notesLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 6 },
  notesText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.white, lineHeight: 20 },
  reviewedText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center" },
  pendingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
  noApplicationText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted, textAlign: "center", padding: 20 },
  notifItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border },
  notifInfo: { flex: 1, gap: 2 },
  notifName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  notifDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  notifToggleOn: { backgroundColor: "rgba(76,175,80,0.3)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  notifToggleText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.success },
  helpCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  helpInfo: { flex: 1, gap: 2 },
  helpTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  helpDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  faqItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: Colors.border },
  faqQ: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  faqA: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
});
