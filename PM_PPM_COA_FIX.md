# PM/PPM COA Missing Data Fix

## Issue Summary
AR numbers that existed in both **PM Requisition** and **Inward Register** were incorrectly showing as "missing" in the PM COA modal.

**Example:** `IWVIPPM2500022` was present in:
- ✅ PM Requisition data
- ✅ Inward Register data
- ❌ But showing as "missing" in PM COA modal

## Root Causes (2 Issues Fixed)

### Issue 1: Backend Matching Logic (FIXED)
The PM/PPM COA matching logic was comparing **material codes** instead of **AR numbers**.

### Issue 2: Frontend Modal Display (FIXED)
The "missing" modal was showing **all materials from unqualified batches**, not just those actually missing from Inward Register.

## Fix 1: Backend Matching Logic

### Old Logic (INCORRECT)
```typescript
// 1. Get material CODES from Requisition
const pmRequirements = await Requisition.aggregate([
  { $match: { "batches.materials.materialType": "PM" } },
  { $group: { 
      _id: "$batches.batchNumber", 
      materials: { $addToSet: "$batches.materials.materialCode" }  // ❌ Wrong field
    } 
  }
]);

// 2. Get material CODES from Inward Register
const inwardMaterialCodes = await InwardRegister.distinct('materialCode');  // ❌ Wrong field

// 3. Compare material codes
// This doesn't verify if the actual AR numbers match!
```

### New Logic (FIXED)
```typescript
// 1. Get AR NUMBERS from Requisition
const pmRequirements = await Requisition.aggregate([
  { $match: { "batches.materials.materialType": "PM" } },
  { $group: { 
      _id: "$batches.batchNumber", 
      arNumbers: { $addToSet: "$batches.materials.arNo" }  // ✅ Correct field
    } 
  }
]);

// 2. Get AR NUMBERS from Inward Register
const inwardArNumbers = await InwardRegister.distinct('arNumber');  // ✅ Correct field

// 3. Compare AR numbers
// Now correctly verifies if the actual AR numbers exist in inward register!
```

## Fix 2: Frontend Modal Display

### Old Logic (INCORRECT)
```typescript
// In "unqualified" view, showed ALL materials from unqualified batches
if (!isQualifiedBatch && batchNo) {
    filteredMaterials.push({
        arNo: m.arNo || 'N/A',
        status: 'Missing / Incomplete Inward',  // ❌ Not checking if AR actually exists
        // ...
    });
}
```

### New Logic (FIXED)
```typescript
// Fetch Inward Register AR numbers
const inwardResponse = await fetch('/api/inward?page=1&limit=100000');
const inwardArNumbersSet = new Set<string>();
inwardData.data.forEach((record: any) => {
    if (record.arNumber && record.arNumber.trim() !== '') {
        inwardArNumbersSet.add(record.arNumber.trim());
    }
});

// Only show materials whose AR numbers are ACTUALLY missing
const arNo = (m.arNo || '').trim();
const isArMissingFromInward = arNo && arNo !== 'N/A' && !inwardArNumbersSet.has(arNo);

if (!isQualifiedBatch && batchNo && isArMissingFromInward) {  // ✅ Now checks if AR is missing
    filteredMaterials.push({
        arNo: m.arNo || 'N/A',
        status: 'Missing in Inward Register',  // ✅ Accurate status
        // ...
    });
}
```

## What Changed

### File 1: `src/app/api/formula/route.ts` (lines 333-404)

**Changed 3 key parts:**

1. **PM Requisition Query** (line 344)
   - From: `materials: { $addToSet: "$batches.materials.materialCode" }`
   - To: `arNumbers: { $addToSet: "$batches.materials.arNo" }`

2. **PPM Requisition Query** (line 363)
   - From: `materials: { $addToSet: "$batches.materials.materialCode" }`
   - To: `arNumbers: { $addToSet: "$batches.materials.arNo" }`

3. **Inward Register Query** (line 379)
   - From: `InwardRegister.distinct('materialCode')`
   - To: `InwardRegister.distinct('arNumber')`

4. **Comparison Logic** (lines 384-403)
   - Now compares AR numbers instead of material codes
   - Properly filters out null/empty AR numbers

### File 2: `src/app/formula-data/page.tsx`

**PM COA Modal (lines 2457-2642):**
1. Added Inward Register AR number fetch (lines 2458-2470)
2. Updated "unqualified" filter to check AR existence (lines 2625-2643)
   - Only shows AR numbers that are **NOT** in Inward Register
   - Changed status from "Missing / Incomplete Inward" to "Missing in Inward Register"

**PPM COA Modal (lines 2878-2932):**
1. Added Inward Register AR number fetch (lines 2879-2893)
2. Updated "unqualified" filter to check AR existence (lines 2916-2936)
   - Only shows AR numbers that are **NOT** in Inward Register
   - Changed status from "Missing / Incomplete Inward" to "Missing in Inward Register"

## Impact

### Before Fix
- **Backend:** AR numbers in requisition were ignored, only material codes were compared
- **Frontend:** All materials from unqualified batches showed as "missing"
- **Result:** Many valid AR numbers (like `IWVIPPM2500022`) showed as "missing" even though they existed in Inward Register
- PM/PPM COA counts were incorrect

### After Fix
- **Backend:** AR numbers are properly compared between Requisition and Inward Register
- **Frontend:** Only AR numbers that are truly missing from Inward Register are shown
- **Result:** Accurate "missing" data - only shows what's actually not received
- PM/PPM COA counts are accurate
- No more false "missing" data

## Testing

To verify the fix:

1. **Restart the dev server** (already done)
2. **Refresh the application** in your browser
3. **Open PM COA modal** and click on the red "missing" section
   - Should only show AR numbers that are **NOT** in Inward Register
   - `IWVIPPM2500022` should **NOT** appear here (it exists in Inward Register)
4. **Open PM COA modal** and click on the green "qualified" section
   - Should show AR numbers that **ARE** in Inward Register
   - `IWVIPPM2500022` **SHOULD** appear here
5. **Check batch `L1825009`** which uses this material
   - Should show as qualified in PM COA statistics

## Data Structure Reference

### Requisition Model
```
Requisition
  └─ batches[]
      └─ materials[]
          ├─ materialCode (e.g., "2EYP01")
          ├─ materialType ("RM" | "PM" | "PPM")
          └─ arNo (e.g., "IWVIPPM2500022")  ← This is what we now check
```

### Inward Register Model
```
InwardRegister
  ├─ materialCode (e.g., "2EYP01")
  └─ arNumber (e.g., "IWVIPPM2500022")  ← This is what we now check
```

## Related Files

- ✅ `src/app/api/formula/route.ts` - Fixed PM/PPM COA matching logic (Backend)
- ✅ `src/app/formula-data/page.tsx` - Fixed PM/PPM COA modal display (Frontend)
- 📄 `INVESTIGATION_REPORT_IWVIPPM2500022.md` - Updated with fix details
- 📄 `PM_PPM_COA_FIX.md` - This document

## Notes

- This fix applies to **both PM and PPM** COA matching
- **Backend fix** ensures AR numbers are the primary matching criteria
- **Frontend fix** ensures only truly missing AR numbers are displayed
- Material codes are still stored but not used for COA qualification
- Empty or null AR numbers are properly filtered out
- The "missing" modal now accurately reflects what's actually not received

