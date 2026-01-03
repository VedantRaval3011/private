# Formula Master Reconciliation - Data Mapping Documentation

> **Document Version:** 1.0  
> **Last Updated:** 2025-12-29  
> **Purpose:** Define the data fields compared during Formula Master vs Batch Creation reconciliation

---

## 📊 Overview

The reconciliation process validates **Batch Creation Data** (source of truth) against the **Formula Master** (control reference) to ensure GMP (Good Manufacturing Practice) compliance.

---

## 🗂️ Data Sources

### 1. Formula Master (Control Reference)

**Collection:** `formulas`  
**Model:** `Formula.ts`

The Formula Master contains the approved manufacturing formulas with:
- Master Formula Card (MFC) details
- Product specifications
- Material Bill of Materials (BOM)
- Revision history

### 2. Batch Creation Data (Source of Truth)

**Collection:** `batches`  
**Model:** `Batch.ts`

Batch Creation data contains actual production records:
- Individual batch records
- Manufacturing details
- Product codes used in production

---

## 🔗 Data Field Mapping

### Formula Master Fields

| Field Path | Description | Example Value |
|------------|-------------|---------------|
| `masterFormulaDetails.masterCardNo` | Master Formula Card Number (unique identifier) | `MFC/IB/DCS041.09` |
| `masterFormulaDetails.productCode` | Primary product code | `CS041G1IB` |
| `masterFormulaDetails.productName` | Product name | `CARMELLOSE SODIUM EYE DROPS` |
| `masterFormulaDetails.revisionNo` | Formula revision number | `0`, `1`, `2` |
| `masterFormulaDetails.manufacturer` | Manufacturing entity | `INDIANA` |
| `masterFormulaDetails.manufacturingLicenseNo` | Manufacturing license number | `G/28/197` |
| `masterFormulaDetails.genericName` | Generic drug name | `Carmellose Sodium` |
| `masterFormulaDetails.specification` | Product specification | `IP` |
| `masterFormulaDetails.shelfLife` | Product shelf life | `24 months` |
| `fillingDetails[].productCode` | Filling product codes (linked products) | `OP041B1B`, `AB041B23I` |
| `processes[].fillingProducts[].productCode` | Process-level product codes | `FP150B3H` |
| `materials[]` | Bill of Materials (BOM) | Array of materials |
| `batchInfo.batchSize` | Standard batch size | `100 L` |

### Batch Creation Fields

| Field Path | Description | Example Value |
|------------|-------------|---------------|
| `batches[].batchNumber` | Unique batch identifier | `D25B20`, `E25A15` |
| `batches[].itemCode` | Product code used in batch | `CS041G1IB` |
| `batches[].itemName` | Product name | `CARMELLOSE SODIUM EYE DROPS 10ML` |
| `batches[].mfgDate` | Manufacturing date | `14-FEB-25` |
| `batches[].expiryDate` | Expiry date | `31-JAN-27` |
| `batches[].batchSize` | Actual batch size | `100 L` |
| `batches[].department` | Manufacturing department | `STERILE EYE DROPS` |
| `batches[].mfgLicNo` | Manufacturing license on batch | `G/28A/6673-A` |
| `batches[].type` | Batch type | `Export` or `Import` |
| `batches[].unit` | Unit of measurement | `BOT`, `SYRIN`, `TUBE` |
| `batches[].make` | Manufacturer | `INDIANA`, `AJANTA` |
| `batches[].locationId` | Manufacturing location | `B1`, `B2` |
| `batches[].pack` | Pack size | `10ML`, `5GM` |

---

## 🔍 Reconciliation Rules & Comparisons

### Rule 1: Formula Usage Validation

**Purpose:** Identify all batches linked to each Formula ID

**Matching Logic:**
```
Batch.itemCode → Formula.masterFormulaDetails.productCode
                 OR Formula.fillingDetails[].productCode
                 OR Formula.processes[].fillingProducts[].productCode
```

**What we check:**
- Count of non-cancelled, non-rejected batches per formula
- Total batches in use

---

### Rule 2: Formula Existence Check

**Purpose:** Ensure every batch references an existing Formula Master

**Comparison:**
| Batch Field | Formula Field | Action if Missing |
|-------------|---------------|-------------------|
| `itemCode` | Any product code in Formula | Mark as "Formula Missing" |

**Orphan Batch Detection:**
- If `Batch.itemCode` does NOT exist in any Formula → **Orphan Batch**
- Compliance Risk: HIGH (if >5 batches) / MEDIUM (if ≤5 batches)

---

### Rule 3: Revision Reconciliation

**Purpose:** Validate batch is using correct formula revision

**Comparison:**
| Batch Revision | Formula Revision | Result |
|----------------|------------------|--------|
| Same | Same | ✅ Valid |
| Lower | Higher | ⚠️ Old Revision Used |
| Higher | Lower | ❌ Invalid / Data Error |

> **Note:** Current batch data schema doesn't include revision field. This rule is prepared for future enhancement.

---

### Rule 4: MFC (Manufacturing License) Consistency Check

**Purpose:** Ensure batch manufacturing license matches Formula Master

**Comparison:**
| Batch Field | Formula Field | Validation |
|-------------|---------------|------------|
| `mfgLicNo` | `manufacturingLicenseNo` | Must be EXACT match |

**Example Mismatch:**
```
Batch Mfg License: G/28A/6673-A (SCI PREC LIFESCI)
Formula Mfg License: G/28/197
Result: ❌ CRITICAL MFC MISMATCH
```

---

### Rule 5: Material Consistency Check

**Purpose:** Compare materials used in batches vs Formula Master BOM

**Comparison:**
| Batch Materials | Formula Materials | Result |
|-----------------|-------------------|--------|
| All present | All present | ✅ Valid |
| Missing materials | Present in BOM | ❌ Deviation |
| Extra materials | Not in BOM | ❌ Unauthorized usage |

> **Note:** Current batch data schema doesn't include material-level details. This rule is prepared for future enhancement when batch material data is available.

---

### Rule 6: Obsolete Formula Check

**Purpose:** Flag batches using obsolete/inactive formulas

**Comparison:**
| Formula Status | Batches Exist | Result |
|----------------|---------------|--------|
| Active | Yes | ✅ Valid |
| Obsolete | Yes | ❌ Compliance Risk |
| Obsolete | No | ✅ No Issue |

> **Note:** Formula status field to be added in future enhancement.

---

## 📈 Reconciliation Status Definitions

| Status | Condition | Color |
|--------|-----------|-------|
| **Fully Reconciled** | All batches pass all validation rules | 🟢 Green |
| **Partially Reconciled** | Some batches pass, some fail | 🟡 Yellow |
| **Not Reconciled** | All batches fail validation | 🔴 Red |
| **No Batches** | Formula has zero batch records | ⚪ Gray |

---

## 📋 Output Data Structure

### Per Formula Output

| Field | Description |
|-------|-------------|
| `formulaId` | Database ID of formula |
| `masterCardNo` | MFC number |
| `productCode` | Main product code |
| `productName` | Product name |
| `revisionNo` | Current revision |
| `manufacturer` | Manufacturer name |
| `stats.totalBatches` | Total batch count |
| `stats.batchesInUse` | Non-cancelled/rejected batches |
| `stats.reconciledBatches` | Batches passing all rules |
| `stats.mismatchedBatches` | Batches failing any rule |
| `mismatchSummary` | Breakdown by mismatch type |
| `reconciliationStatus` | Overall status |
| `linkedProductCodes` | All linked product codes |
| `batchDetails` | Individual batch validation results |
| `complianceNotes` | Audit notes |

### Per Batch Output

| Field | Description |
|-------|-------------|
| `batchNumber` | Batch identifier |
| `itemCode` | Product code |
| `itemName` | Product name |
| `mfgDate` | Manufacturing date |
| `expiryDate` | Expiry date |
| `batchSize` | Batch size |
| `department` | Department |
| `type` | Export/Import |
| `isValid` | Pass/Fail flag |
| `mismatches[]` | Array of mismatch details |
| `mismatches[].type` | Mismatch type (e.g., `mfc_mismatch`) |
| `mismatches[].description` | Detailed explanation |
| `mismatches[].severity` | `critical` / `warning` / `info` |

---

## 🔧 Compliance Score Calculation

```
Compliance Score = ((Fully Reconciled + 0.5 × Partially Reconciled) / Formulas with Batches) × 100
```

| Score Range | Rating |
|-------------|--------|
| 80-100% | 🟢 Good |
| 50-79% | 🟡 Needs Attention |
| 0-49% | 🔴 Critical |

---

## 🚀 Future Enhancements

1. **Batch-level revision tracking** - Add revision field to batch data
2. **Material-level validation** - Compare actual materials used vs BOM
3. **Formula status field** - Track Active/Obsolete/Draft status
4. **Cancelled/Rejected batch filtering** - Add batch status field
5. **Batch completion date validation** - Compare against shelf life
6. **Audit trail export** - Generate PDF/Excel reports

---

## 📁 Related Files

| File | Purpose |
|------|---------|
| `src/types/reconciliation.ts` | TypeScript type definitions |
| `src/app/api/reconciliation/route.ts` | Reconciliation API logic |
| `src/app/reconciliation/page.tsx` | Reconciliation UI page |
| `src/models/Formula.ts` | Formula Master schema |
| `src/models/Batch.ts` | Batch data schema |
| `src/types/formula.ts` | Shared formula types |

---

*Document maintained by: Development Team*  
*For questions, contact the Quality Assurance department.*
