/**
 * Maintenance & Temporary Service Block Configuration
 *
 * When TEMPORARY_SERVICE_BLOCK is true:
 * 1. Both Client and Driver apps will automatically log out all users upon launch or OTA update receipt.
 * 2. When users attempt to log in or register, they are prevented from logging in and shown:
 *    "Temporarily unavailable, try again later".
 * 3. All backend data, user accounts, and credentials remain untouched.
 *
 * When this temporary block is lifted (set to false and published via OTA), users will
 * be able to log in again normally with their existing credentials.
 */
export const TEMPORARY_SERVICE_BLOCK = false;

export const TEMPORARY_SERVICE_BLOCK_MESSAGE = "Temporarily unavailable, try again later";

/**
 * Temporary White Buttons Visibility Configuration
 *
 * When TEMPORARY_HIDE_WHITE_BUTTONS is true:
 * All primary white action buttons in the client and driver apps
 * (login, register, dashboard actions, etc.) are hidden (display: 'none').
 *
 * When set to false, all white buttons are instantly restored to their normal visible state.
 */
export const TEMPORARY_HIDE_WHITE_BUTTONS = false;

export const whiteButtonHiddenStyle = TEMPORARY_HIDE_WHITE_BUTTONS
  ? ({ display: "none" } as const)
  : {};
