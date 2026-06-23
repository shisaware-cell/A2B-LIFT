# Google Maps and Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both native apps render Google Maps, give drivers reliable Google turn-by-turn navigation, and correct the reward QR and client launch-logo layout.

**Architecture:** `A2BMap.native.tsx` is the single shared map component, so it will explicitly select the Google provider on both mobile platforms. A focused navigation URL helper keeps platform-specific Google Maps deep links out of the chauffeur dashboard. The reward view is shared by client and driver routes, so one layout correction serves both apps.

**Tech Stack:** Expo Router, React Native, react-native-maps, Expo Linking, react-native-qrcode-svg, Node test runner.

---

### Task 1: Lock Down Google Map and QR Regressions

**Files:**
- Create: `server/mobile-map-release.test.ts`
- Modify: `components/A2BMap.native.tsx`
- Modify: `app/client/referrals.tsx`

- [x] **Step 1: Write failing tests** for Google provider selection, QR dimensions, and the navigation helper contract.
- [x] **Step 2: Run the test** with `TMPDIR=/private/tmp node --import tsx --test server/mobile-map-release.test.ts` and confirm it fails because the helper does not exist.
- [x] **Step 3: Implement the focused map and QR changes.**
- [x] **Step 4: Re-run the test** and confirm it passes.

### Task 2: Driver Navigation and Client Launch Icon

**Files:**
- Create: `lib/google-navigation.ts`
- Modify: `app/chauffeur/index.tsx`
- Modify: `app/index.tsx`

- [x] **Step 1: Use the navigation helper from the accepted-ride action** so driver navigation opens Google Maps with driving directions.
- [x] **Step 2: Contain the client logo within a black rounded launch tile** to remove the source image's white corner pixels from the first screen.
- [x] **Step 3: Run the full test suite and Expo config checks** for both build variants.

### Task 3: Release Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-23-google-maps-and-mobile-polish.md`

- [x] **Step 1: Run production JavaScript exports for driver and client.**
- [x] **Step 2: Confirm the build config embeds the Google Maps API key in iOS and Android config for both variants.**
- [ ] **Step 3: Commit only these mobile release files and push the existing release branch to `main`.**
