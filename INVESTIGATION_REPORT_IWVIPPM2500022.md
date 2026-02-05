# Investigation Report: AR Number IWVIPPM2500022

## Summary
✅ **The data IS properly fetched and stored in the database**
✅ **FIXED: PM/PPM COA matching logic now correctly identifies AR numbers**

## Key Findings

### 1. Data Exists in Inward Register
- AR Number: `IWVIPPM2500022` ✅ **FOUND**
- The record was successfully parsed from the XML file
- It is stored in the `inward_registers` collection

### 2. Material Classification
- The material associated with `IWVIPPM2500022` is classified as **PM** (Packing Material)
- **NOT** PPM (Primary Packing Material)
- This is determined by the Requisition data, where the material type is set to "PM"

### 3. Root Cause: Incorrect Matching Logic
The AR number was showing as "missing" in the **PM COA** view because:

1. **OLD LOGIC (INCORRECT)**: The system was comparing **material codes** from Requisition vs Inward Register
   - Requisition has: `materialCode` + `arNo` for each material
   - Inward Register has: `materialCode` + `arNumber` for each entry
   - The old logic only checked if material codes matched, ignoring AR numbers

2. **THE PROBLEM**: 
   - Even though `IWVIPPM2500022` exists in both Requisition and Inward Register
   - The material code comparison was not sufficient
   - AR numbers were being ignored in the matching process

3. **NEW LOGIC (FIXED)**: 
   - Now checks **AR numbers** from Requisition materials against **AR numbers** in Inward Register
   - Changed from: `$addToSet: "$batches.materials.materialCode"`
   - Changed to: `$addToSet: "$batches.materials.arNo"`
   - Changed from: `InwardRegister.distinct('materialCode')`
   - Changed to: `InwardRegister.distinct('arNumber')`

## How the Matching Works NOW (FIXED)

### PM COA Matching (lines 337-392 in formula/route.ts)
```typescript
// 1. Get PM AR numbers per batch from Requisitions
const pmRequirements = await Requisition.aggregate([
  { $match: { "batches.materials.materialType": "PM" } },
  { $group: { _id: "$batches.batchNumber", arNumbers: { $addToSet: "$batches.materials.arNo" } } }
]);

// 2. Get AR numbers from Inward Register
const inwardArNumbers = await InwardRegister.distinct('arNumber');

// 3. A batch is "qualified" if ALL its PM AR numbers exist in Inward Register
```

### PPM COA Matching (same logic)
```typescript
// Same logic but for materialType: "PPM"
const ppmRequirements = await Requisition.aggregate([
  { $match: { "batches.materials.materialType": "PPM" } },
  { $group: { _id: "$batches.batchNumber", arNumbers: { $addToSet: "$batches.materials.arNo" } } }
]);
```

## Verification Steps

To verify the fix is working:

1. **Refresh the application** - The PM COA modal should now correctly show AR numbers

2. **Check PM COA Modal**: 
   - `IWVIPPM2500022` should now appear as "qualified" (green)
   - It should NOT appear in the "missing" (red) section

3. **Check the batch using this material**:
   - Sample batch: `L1825009` (Type: PM)
   - Should show as qualified in PM COA statistics

## Conclusion

**The issue has been FIXED**. The problem was:
- The AR number `IWVIPPM2500022` exists in both PM Requisition and Inward Register
- But the old matching logic was comparing material codes, not AR numbers
- The new logic correctly compares AR numbers, so the data is no longer "missing"

This fix applies to both **PM COA** and **PPM COA** matching.

## Files Modified

1. `src/app/api/formula/route.ts` (lines 333-404)
   - Changed PM/PPM matching to use AR numbers instead of material codes
   - Updated aggregation queries to use `arNo` field
   - Updated Inward Register query to use `arNumber` field
