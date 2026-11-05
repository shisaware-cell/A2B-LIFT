import { whiteButtonHiddenStyle } from "@/lib/maintenance-config";
import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, Platform, KeyboardAvoidingView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSocket } from "@/lib/socket-context";
import Colors from "@/constants/colors";

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { rideId, riderName } = useLocalSearchParams<{ rideId: string; riderName: string }>();
  const { on, off } = useSocket();
  const [messageText, setMessageText] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["/api/messages/ride", rideId || ""],
    enabled: !!rideId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    const handleNewMessage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/ride", rideId || ""] });
    };
    on("chat:newMessage", handleNewMessage);
    return () => { off("chat:newMessage", handleNewMessage); };
  }, [rideId]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated — please log in again.");
      if (!rideId) throw new Error("No active ride found.");
      const res = await apiRequest("POST", "/api/messages", {
        rideId,
        senderId: user.id,
        messageText: messageText.trim(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server error ${res.status}`);
      }
    },
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/ride", rideId || ""] });
    },
    onError: (error: any) => {
      Alert.alert("Message Failed", error?.message || "Could not send message. Please try again.");
    },
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessage = useCallback(({ item }: { item: any }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.messageBubble, isMe ? styles.myMessage : styles.theirMessage]}>
        <Text style={[styles.messageText, isMe ? styles.myText : styles.theirText]}>{item.messageText}</Text>
        <Text style={[styles.messageTime, isMe ? styles.myTime : styles.theirTime]}>{formatTime(item.createdAt)}</Text>
      </View>
    );
  }, [user?.id]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.white} />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="person" size={16} color={Colors.white} />
          </View>
          <View>
            <Text style={styles.headerName}>{riderName || "Rider"}</Text>
            <Text style={styles.headerStatus}>Active ride</Text>
          </View>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.white} />
        </View>
      ) : (
        <FlatList
          data={Array.isArray(messages) ? [...messages].reverse() : []}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          inverted={true}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "web" ? 84 : 0}
      >
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 84 : 16) }]}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textMuted}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => { if (messageText.trim()) sendMutation.mutate(); }}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, (!messageText.trim() || sendMutation.isPending) && { opacity: 0.4 }]}
            onPress={() => { if (messageText.trim() && !sendMutation.isPending) sendMutation.mutate(); }}
          >
            {sendMutation.isPending
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="send" size={18} color={Colors.primary} />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  headerName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.white },
  headerStatus: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.success },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { flex: 1 },
  messagesList: { padding: 16, gap: 8, flexGrow: 1 },
  messageBubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, gap: 4 },
  myMessage: { alignSelf: "flex-end", backgroundColor: Colors.white, borderBottomRightRadius: 4 },
  theirMessage: { alignSelf: "flex-start", backgroundColor: Colors.surface, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20 },
  myText: { color: Colors.primary },
  theirText: { color: Colors.white },
  messageTime: { fontSize: 10, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  myTime: { color: Colors.textMuted },
  theirTime: { color: Colors.textMuted },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
    minHeight: 64,
  },
  textInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.white,
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.white, alignItems: "center", justifyContent: "center", marginBottom: 2, ...whiteButtonHiddenStyle },
});
