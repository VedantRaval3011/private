/**
 * Content Hash Utility
 * Generates SHA-256 hash for XML content to detect duplicates
 */

import { createHash } from 'crypto';

/**
 * Generate SHA-256 hash of content
 * Used for duplicate detection based on file content
 */
export function generateContentHash(content: string): string {
  return createHash('sha256')
    .update(content.trim())
    .digest('hex');
}

/**
 * Normalize XML content before hashing
 * Removes whitespace variations that don't affect data
 */
export function normalizeXmlContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')  // Normalize line endings
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Generate hash with normalization
 */
export function generateNormalizedHash(content: string): string {
  return generateContentHash(normalizeXmlContent(content));
}
