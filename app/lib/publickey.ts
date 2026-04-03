import { PublicKey } from '@solana/web3.js';

/**
 * Safely parse and validate a PublicKey from user input
 * Provides consistent error handling and clear error messages across the API
 *
 * @param input - Raw string/input to parse (should be a base58-encoded Solana address)
 * @param fieldName - Field name for error messages (e.g., "wallet address", "market address")
 * @returns Validated PublicKey instance
 * @throws Error with descriptive message if input is invalid
 *
 * @example
 * try {
 *   const wallet = parsePublicKey(userInput, 'wallet address');
 *   // wallet is now a valid PublicKey
 * } catch (err) {
 *   console.error(err.message); // "Invalid wallet address..."
 * }
 */
export function parsePublicKey(
  input: unknown,
  fieldName = 'address'
): PublicKey {
  // Type check
  if (typeof input !== 'string') {
    throw new Error(
      `${fieldName} must be a string, got ${typeof input}`
    );
  }

  const trimmed = input.trim();

  // Empty check
  if (!trimmed) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  // Parse as PublicKey
  try {
    const pubKey = new PublicKey(trimmed);
    return pubKey;
  } catch (err) {
    // Provide helpful error message with truncated input for debugging
    const preview = trimmed.substring(0, 20) + (trimmed.length > 20 ? '...' : '');
    throw new Error(
      `Invalid ${fieldName}. Expected base58-encoded Solana public key, got: ${preview}`
    );
  }
}

/**
 * Safely parse an array of PublicKeys from user input
 *
 * @param input - Array of strings to parse
 * @param fieldName - Field name for error messages
 * @returns Array of validated PublicKey instances
 * @throws Error if input is not an array or any element is invalid
 *
 * @example
 * const addresses = parsePublicKeyArray(userInputArray, 'wallet addresses');
 */
export function parsePublicKeyArray(
  input: unknown,
  fieldName = 'addresses'
): PublicKey[] {
  if (!Array.isArray(input)) {
    throw new Error(`${fieldName} must be an array, got ${typeof input}`);
  }

  return Array.from(input).map((addr, idx) =>
    parsePublicKey(addr, `${fieldName}[${idx}]`)
  );
}
