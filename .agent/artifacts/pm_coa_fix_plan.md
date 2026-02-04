# PM COA Green Modal Over-Count Fix Plan

## Problem Statement
The PM COA green modal is showing **1313 unique batches** when it should show **1282 unique batches**.

### Expected Behavior:
- Total Unique Batches (Top Capsule): **1286** ✅
- Green (Available): **1282** ✅  
- Red (Missing): **4** ✅
- **Math Check**: 1282 + 4 = 1286 ✅

### Current Issue:
- Green Modal shows: **1313** ❌ (over-count by 31 batches)
- This violates the rule: Green count cannot exceed Total count (1313 > 1286)

## Root Cause Analysis

### Backend Logic (CORRECT):
Located in `/src/app/api/formula/route.ts` lines 383-392:

```typescript
const pmCoaInwardQualifiedBatchNumbers = new Set<string>();
batchPmExpecations.forEach((materials, batchNumber) => {
  let allFound = true;
  materials.forEach(code => {
    if (!inwardMaterialCodeSet.has(code)) allFound = false;
  });
  if (allFound) {
    pmCoaInwardQualifiedBatchNumbers.add(batchNumber);
  }
});
```

This correctly:
1. Gets PM material requirements per batch from Requisition
2. Checks if ALL required materials exist in Inward Register
3. Adds batch to qualified set only if ALL materials found
4. Uses a **Set** to ensure unique batches
5. Returns size = 1282 (correct)

### Frontend Modal Logic (INCORRECT):
The modal is likely:
1. Query Inward Register for PM materials
2. Join with Requisition data
3. **Count at AR/Material/Inward Record level instead of Batch level**
4. Missing `distinct(batchNumber)` aggregation
5. Result: 1313 rows (over-count)

## Fix Strategy

### Option 1: Provide Pre-Filtered Modal Data from Backend
Create a dedicated API endpoint that returns exactly the data the modal needs, pre-filtered at the batch level.

**New Endpoint**: `/api/formula/pm-coa-modal`

**Response**:
```typescript
{
  uniqueBatches: string[],              // Array of 1282 unique batch numbers
  batchDetails: {
    batchNumber: string,
    materials: Array<{
      materialCode: string,
      materialName: string,
      arNumbers: string[],
      inwardRecords: number
    }>,
    arCount: number,
    materialCount: number
  }[],
  summary: {
    totalUniqueBatches: 1282,
    totalARNumbers: number,
    totalUniqueMaterials: number,
    totalRecords: number
  }
}
```

### Option 2: Fix Frontend Modal Filtering Logic
Ensure the modal:
1. Fetches `pmCoaInwardQualifiedBatchNumbersList` from `/api/formula`
2. Filters Inward Register data to only include these 1282 batch numbers
3. Groups/aggregates explicitly by `batchNumber`
4. Shows unique batch count using `new Set(batchNumbers).size`

## Implementation Steps

### Step 1: Add Backend Endpoint (Recommended)
Create `/src/app/api/formula/pm-coa-modal/route.ts`:

```typescript
// Fetch Requisition PM requirements
// Fetch Inward Register PM materials
// Join and filter at BATCH level
// Return aggregated data grouped by batchNumber
// Ensure: uniqueBatches.length === 1282
```

### Step 2: Update Frontend Modal
Update PM COA modal click handler to:
```typescript
// Use pmCoaInwardQualifiedBatchNumbersList from API
// Display: uniqueBatches.size (not raw record count)
// Ensure modal header shows: "1282 Unique Batches"
```

### Step 3: Verification
- Green Modal: 1282 ✅
- Red Modal: 4 ✅
- Total Capsule: 1286 ✅
- Math: 1282 + 4 === 1286 ✅

## Test Cases

1. **Capsule Math Verification**:
   - Green + Red = Total
   - 1282 + 4 = 1286 ✅

2. **Modal Count Verification**:
   - Green modal header shows exactly: "1282 Unique Batches"
   - Count should match capsule green value

3. **Data Integrity**:
   - All batches in green modal exist in Master Data
   - All batches in green modal exist in Inward Register
   - All batches have ALL their PM materials in Inward Register
   - Batches are deduplicated (counted once even if in multiple ARs/materials)

4. **No Over-Count**:
   - Modal count <= Top capsule count
   - 1282 <= 1286 ✅

## Success Criteria

✅ Green modal shows exactly **1282 Unique Batches**  
✅ These 1282 batches all have complete PM material coverage in Inward Register  
✅ Batches are unique (no duplicates from multiple ARs/materials)  
✅ Green (1282) + Red (4) = Total (1286)  
✅ Modal data matches capsule logic exactly
