# PM/PPM COA AR Number Version Suffix Fix

## Issue Summary
AR numbers with version suffixes in the Inward Register were not matching with base AR numbers in Requisition data, causing valid materials to show as "missing".

**Example:** `IWAAJPM2400231`
- ✅ Requisition has: `IWAAJPM2400231`
- ✅ Inward Register has: `IWAAJPM2400231.1` (with version suffix `.1`)
- ❌ These didn't match, so it showed as "missing"

## Root Cause

### AR Number Format Mismatch

**Inward Register AR Numbers:**
- Format: `IWAAJPM2400231.1`, `IWAAJPM2400231.2`, etc.
- Include version suffixes (`.1`, `.2`, `.3`, etc.)
- These suffixes indicate different batches/versions of the same material

**Requisition AR Numbers:**
- Format: `IWAAJPM2400231`
- No version suffixes
- Just the base AR number

### The Matching Problem

```typescript
// OLD CODE (BROKEN)
const inwardArNumbersSet = new Set<string>();
inwardData.arNumbers.forEach((arNumber: string) => {
    inwardArNumbersSet.add(arNumber.trim());  // Adds "IWAAJPM2400231.1"
});

// Later, checking if requisition AR exists:
const arNo = "IWAAJPM2400231";  // From requisition (no suffix)
const exists = inwardArNumbersSet.has(arNo);  // ❌ FALSE - doesn't match!
```

**Why it failed:**
1. Inward Register stores: `"IWAAJPM2400231.1"`
2. Requisition has: `"IWAAJPM2400231"`
3. Exact string match fails: `"IWAAJPM2400231.1" !== "IWAAJPM2400231"`
4. System incorrectly marks as "missing"

## The Fix

### Updated Matching Logic

Store **both** the full AR number AND the base AR number (without suffix):

```typescript
// NEW CODE (FIXED)
const inwardArNumbersSet = new Set<string>();
inwardData.arNumbers.forEach((arNumber: string) => {
    const trimmedAr = arNumber.trim();
    
    // Add the full AR number (with suffix)
    inwardArNumbersSet.add(trimmedAr);  // "IWAAJPM2400231.1"
    
    // Also add the base AR number (without suffix)
    const baseAr = trimmedAr.split('.')[0];  // "IWAAJPM2400231"
    if (baseAr && baseAr !== trimmedAr) {
        inwardArNumbersSet.add(baseAr);  // ✅ Now both versions are in the set!
    }
});

// Later, checking if requisition AR exists:
const arNo = "IWAAJPM2400231";  // From requisition
const exists = inwardArNumbersSet.has(arNo);  // ✅ TRUE - matches base AR!
```

### How It Works

For each AR number in Inward Register:
1. **Add full AR number:** `"IWAAJPM2400231.1"` → Set
2. **Extract base AR:** Split by `.` → `["IWAAJPM2400231", "1"]`
3. **Add base AR:** `"IWAAJPM2400231"` → Set

**Result:** The set contains both:
- `"IWAAJPM2400231.1"` (full version)
- `"IWAAJPM2400231"` (base version)

Now when checking requisition AR `"IWAAJPM2400231"`, it **matches** the base version!

## Files Changed

### File: `src/app/formula-data/page.tsx`

**PM COA Modal (lines 2462-2481):**
```typescript
// Build set of AR numbers that exist in Inward Register
// CRITICAL: Handle version suffixes (.1, .2, etc.)
// Inward Register may have "IWAAJPM2400231.1" while Requisition has "IWAAJPM2400231"
const inwardArNumbersSet = new Set<string>();
if (inwardData.success && inwardData.arNumbers) {
    inwardData.arNumbers.forEach((arNumber: string) => {
        if (arNumber && arNumber.trim() !== '') {
            const trimmedAr = arNumber.trim();
            // Add the full AR number
            inwardArNumbersSet.add(trimmedAr);
            
            // Also add the base AR number (without version suffix)
            // e.g., "IWAAJPM2400231.1" → "IWAAJPM2400231"
            const baseAr = trimmedAr.split('.')[0];
            if (baseAr && baseAr !== trimmedAr) {
                inwardArNumbersSet.add(baseAr);
            }
        }
    });
}
```

**PPM COA Modal (lines 2894-2913):**
- Applied the same fix as PM COA modal

## Impact

### Before Fix
- ❌ AR numbers with version suffixes didn't match base AR numbers
- ❌ `IWAAJPM2400231` showed as "missing" even though `IWAAJPM2400231.1` existed
- ❌ Many false "missing" entries in PM/PPM COA modals

### After Fix
- ✅ AR numbers match regardless of version suffixes
- ✅ `IWAAJPM2400231` correctly identified as present (matches `IWAAJPM2400231.1`)
- ✅ Accurate "missing" data - only truly missing AR numbers shown
- ✅ Works for all version suffixes (`.1`, `.2`, `.3`, etc.)

## Examples

### Example 1: Single Version
**Inward Register:** `IWAAJPM2400231.1`  
**Requisition:** `IWAAJPM2400231`  
**Result:** ✅ **MATCH** (base AR matches)

### Example 2: Multiple Versions
**Inward Register:** `IWAAJPM2400231.1`, `IWAAJPM2400231.2`, `IWAAJPM2400231.3`  
**Requisition:** `IWAAJPM2400231`  
**Result:** ✅ **MATCH** (base AR matches any version)

### Example 3: No Suffix
**Inward Register:** `IWVIPPM2500022`  
**Requisition:** `IWVIPPM2500022`  
**Result:** ✅ **MATCH** (exact match, no suffix handling needed)

## Testing

To verify the fix:

1. **Refresh your browser** (hard refresh: Ctrl+Shift+R)
2. **Open PPM COA modal** → Click red "missing" section
   - `IWAAJPM2400231` should **NOT** appear here ✅
3. **Open PPM COA modal** → Click green "qualified" section
   - Materials using `IWAAJPM2400231` **SHOULD** appear here ✅
4. **Verify other AR numbers** with version suffixes work correctly

## Technical Details

### String Splitting Logic

```javascript
// Example: "IWAAJPM2400231.1"
const arNumber = "IWAAJPM2400231.1";
const parts = arNumber.split('.');  // ["IWAAJPM2400231", "1"]
const baseAr = parts[0];            // "IWAAJPM2400231"

// Example: "IWVIPPM2500022" (no suffix)
const arNumber2 = "IWVIPPM2500022";
const parts2 = arNumber2.split('.');  // ["IWVIPPM2500022"]
const baseAr2 = parts2[0];            // "IWVIPPM2500022"
// baseAr2 === arNumber2, so we don't add it twice
```

### Edge Cases Handled

1. **No suffix:** `"IWAAJPM2400231"` → Only added once
2. **Single suffix:** `"IWAAJPM2400231.1"` → Adds both full and base
3. **Multiple dots:** `"IWAAJPM2400231.1.2"` → Base is `"IWAAJPM2400231"`
4. **Empty/null:** Filtered out before processing

## Related Fixes

This fix builds on previous fixes:
1. ✅ Backend matching logic (AR numbers vs material codes)
2. ✅ Pagination fix (efficient AR numbers API)
3. ✅ **Version suffix handling** (this fix)

All three fixes work together to ensure accurate PM/PPM COA data.

## Notes

- This fix applies to **both PM and PPM** COA modals
- Version suffixes are common in Inward Register data
- The fix is backward compatible (works with or without suffixes)
- No database changes needed - pure frontend logic update
