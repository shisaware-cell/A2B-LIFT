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
