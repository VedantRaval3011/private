/**
 * Normalize storage condition text for display and APQR export.
 * Product Master XML often stores ° as Windows-1252 byte 0xB0, which becomes U+FFFD when read as UTF-8.
 */
export function normalizeStorageCondition(val: string | undefined | null): string {
  if (!val) return val ?? '';
  return val
    .replace(/\uFFFD(?=[Cc])/g, '°')
    .replace(/\?(?=[Cc])/g, '°');
}
