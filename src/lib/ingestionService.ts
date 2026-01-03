/**
 * Ingestion Service
 * Orchestrates reading XML files from /files folder,
 * detecting types, parsing, and storing with duplicate prevention
 */

import { promises as fs } from 'fs';
import path from 'path';
import { connectToDatabase } from './mongodb';
import { generateNormalizedHash } from './contentHash';
import { detectXmlType, getFileTypeName } from './xmlTypeDetector';
import { parseBatchRegistryXml, parseFormulaXml, parseMultipleFormulasXml } from './xmlParser';
import { parseCOAXml } from './coaParser';
import { parseRequisitionXml } from './requisitionParser';
import ProcessingLog from '@/models/ProcessingLog';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import COA from '@/models/COA';
import Requisition from '@/models/Requisition';
import { v4 as uuidv4 } from 'uuid';
import type { 
  XmlFileInfo, 
  IngestionResult, 
  IngestionStatus,
  XmlFileType,
  ItemLevelStats,
  DuplicateItemDetail,
  SuccessfulItemDetail,
  FormulaLevelStats,
  DuplicateFormulaDetail,
  SuccessfulFormulaDetail
} from '@/types/ingestion';
import type { RequisitionMaterial } from '@/types/requisition';

// Files folder path (relative to project root)
const FILES_FOLDER = path.join(process.cwd(), 'files');

// Maximum size for storing raw XML content in MongoDB (14MB to stay under 16MB BSON limit)
const MAX_RAW_CONTENT_SIZE = 14 * 1024 * 1024;

/**
 * Clean up orphaned processing logs
 * Removes logs where the corresponding Batch/Formula record no longer exists
 */
async function cleanupOrphanedLogs(): Promise<number> {
  try {
    // Get all processing logs with SUCCESS or DUPLICATE status (both can become orphaned)
    const logs = await ProcessingLog.find({ 
      status: { $in: ['SUCCESS', 'DUPLICATE'] } 
    }).lean();
    
    const orphanedLogIds: string[] = [];
    
    for (const log of logs) {
      const contentHash = log.contentHash;
      const fileName = log.fileName;
      const fileType = log.fileType;
      
      // Check if the corresponding record still exists
      // Try to find by contentHash first, then by fileName as fallback
      let recordExists = false;
      
      if (fileType === 'BATCH') {
        // Check by contentHash OR fileName
        const batch = await Batch.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : [])
          ]
        }).lean();
        recordExists = !!batch;
      } else if (fileType === 'FORMULA') {
        // Check by contentHash OR fileName
        const formula = await Formula.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : [])
          ]
        }).lean();
        recordExists = !!formula;
      }
      
      // If record doesn't exist, mark log as orphaned
      if (!recordExists && log._id) {
        orphanedLogIds.push(log._id.toString());
      }
    }
    
    // Delete orphaned logs
    if (orphanedLogIds.length > 0) {
      const result = await ProcessingLog.deleteMany({ 
        _id: { $in: orphanedLogIds } 
      });
      console.log(`Cleaned up ${result.deletedCount} orphaned processing log(s)`);
      return result.deletedCount || 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error cleaning up orphaned logs:', error);
    return 0;
  }
}

/**
 * Scan the /files folder for XML files
 */
export async function scanFilesFolder(): Promise<XmlFileInfo[]> {
  const xmlFiles: XmlFileInfo[] = [];
  
  try {
    // Check if folder exists
    await fs.access(FILES_FOLDER);
    
    // Read all files in the folder
    const files = await fs.readdir(FILES_FOLDER);
    
    for (const fileName of files) {
      // Only process XML files
      if (!fileName.toLowerCase().endsWith('.xml')) {
        continue;
      }
      
      const filePath = path.join(FILES_FOLDER, fileName);
      const stats = await fs.stat(filePath);
      
      // Only process files (not directories)
      if (!stats.isFile()) {
        continue;
      }
      
      // Read file content with error handling for large files
      try {
        // Read file content
        // Note: Node.js fs.readFile handles files up to 2GB efficiently. 
        // 73MB is well within limits and doesn't require manual streaming which can cause buffer issues.
        const content = await fs.readFile(filePath, 'utf-8');
        if (stats.size > 50 * 1024 * 1024) {
          console.log(`   ✅ Large file read successfully (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        }
        
        xmlFiles.push({
          fileName,
          filePath,
          fileSize: stats.size,
          content,
        });
      } catch (readError) {
        console.error(`   ❌ Error reading file ${fileName}:`, readError instanceof Error ? readError.message : readError);
        // Skip this file but continue with others
        continue;
      }
    }
  } catch (error) {
    console.error('Error scanning files folder:', error);
  }
  
  return xmlFiles;
}

/**
 * Process a single XML file with duplicate detection
 */
export async function processXmlFile(fileInfo: XmlFileInfo): Promise<IngestionResult> {
  const { fileName, fileSize, content } = fileInfo;
  
  try {
    // Step 1: Generate content hash
    const contentHash = generateNormalizedHash(content);
    
    // Step 2: Check if already processed (hash exists)
    // Only skip early for BATCH files (they have item-level duplicate detection)
    // For FORMULA files with same hash, we still need to parse and check each formula
    const existingLog = await ProcessingLog.findOne({ contentHash });
    const fileType = detectXmlType(content);
    
    // Log file type detection
    console.log(`\n📁 Processing: ${fileName}`);
    console.log(`   Detected Type: ${fileType}`);
    
    // Skip early if already processed for BATCH, COA, and REQUISITION (exact duplicates)
    // BUT only if previous processing was NOT an error
    if (existingLog && existingLog.status !== 'ERROR' && (fileType === 'BATCH' || fileType === 'COA' || fileType === 'REQUISITION')) {
      console.log(`   ⚠️ SKIPPED: Already processed on ${existingLog.processedAt.toISOString()}`);
      return {
        fileName,
        fileType: existingLog.fileType as XmlFileType,
        status: 'DUPLICATE',
        message: `File already processed on ${existingLog.processedAt.toISOString()}`,
        businessKey: existingLog.businessKey,
      };
    }
    
    // fileType is already detected above
    
    if (fileType === 'UNKNOWN') {
      // Log the error using findOneAndUpdate to prevent duplicate key error
      await ProcessingLog.findOneAndUpdate(
        { contentHash },
        {
          contentHash,
          fileName,
          fileType: 'UNKNOWN',
          status: 'ERROR',
          errorMessage: 'Could not determine XML file type from content',
          fileSize,
          processedAt: new Date(),
        },
        { upsert: true }
      );
      
      return {
        fileName,
        fileType: 'UNKNOWN',
        status: 'ERROR',
        message: 'Could not determine XML file type from content',
      };
    }
    
    // Step 4: Parse based on detected type
    let businessKey: string | undefined;
    let recordId: string | undefined;
    
    if (fileType === 'BATCH') {
      const result = await processBatchXml(content, fileName, fileSize, contentHash);
      businessKey = result.businessKey;
      recordId = result.recordId;
      
      if (result.duplicate) {
        // Build detailed message with item stats
        let duplicateMessage = `All items already exist`;
        if (result.itemStats) {
          duplicateMessage = `All ${result.itemStats.totalItems} items are duplicates (already in database)`;
        }
        
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'BATCH',
            status: 'DUPLICATE',
            businessKey,
            fileSize,
            itemStats: result.itemStats,  // Store duplicate details
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'BATCH',
          status: 'DUPLICATE',
          message: duplicateMessage,
          businessKey,
          itemStats: result.itemStats,  // Include in result
        };
      }
      
      // Partial success - some items were new, some were duplicates
      if (result.itemStats && result.itemStats.duplicateItems > 0) {
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'BATCH',
            status: 'SUCCESS',
            businessKey,
            fileSize,
            itemStats: result.itemStats,  // Store duplicate details
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'BATCH',
          status: 'SUCCESS',
          message: `Stored ${result.itemStats.newItems} new items (${result.itemStats.duplicateItems} duplicates skipped)`,
          businessKey,
          recordId,
          itemStats: result.itemStats,  // Include in result
        };
      }
    } else if (fileType === 'FORMULA') {
      const result = await processFormulaXml(content, fileName, fileSize, contentHash);
      businessKey = result.businessKey;
      recordId = result.recordId;
      
      if (result.duplicate) {
        // All formulas were duplicates
        const stats = result.formulaStats;
        const message = stats 
          ? `All ${stats.totalFormulas} formula(s) already exist in database`
          : `Formula already exists with key: ${businessKey}`;
        
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'FORMULA',
            status: 'DUPLICATE',
            businessKey,
            fileSize,
            formulaStats: stats,
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'FORMULA',
          status: 'DUPLICATE',
          message,
          businessKey,
          formulaStats: stats,
        };
      }
      
      // Some or all formulas were new
      const stats = result.formulaStats;
      if (stats && stats.duplicateFormulas > 0) {
        // Partial success - some were new, some were duplicates
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'FORMULA',
            status: 'SUCCESS',
            businessKey,
            fileSize,
            formulaStats: stats,
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'FORMULA',
          status: 'SUCCESS',
          message: `Stored ${stats.newFormulas} new formula(s) (${stats.duplicateFormulas} duplicate(s) skipped, ${stats.totalFormulas} total found)`,
          businessKey,
          recordId,
          formulaStats: stats,
        };
      }
    } else if (fileType === 'COA') {
      const result = await processCOAXml(content, fileName, fileSize, contentHash);
      businessKey = result.businessKey;
      recordId = result.recordId;
      
      if (result.duplicate) {
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'COA',
            status: 'DUPLICATE',
            businessKey,
            fileSize,
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'COA',
          status: 'DUPLICATE',
          message: `COA already processed: ${businessKey}`,
          businessKey,
        };
      }
    } else if (fileType === 'REQUISITION') {
      const result = await processRequisitionXml(content, fileName, fileSize, contentHash);
      businessKey = result.businessKey;
      recordId = result.recordId;
      
      if (result.duplicate) {
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'REQUISITION',
            status: 'DUPLICATE',
            businessKey,
            fileSize,
            itemStats: result.itemStats,
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        const duplicateMessage = result.itemStats 
          ? `All ${result.itemStats.totalItems} materials are duplicates`
          : 'Requisition already processed';
        
        return {
          fileName,
          fileType: 'REQUISITION',
          status: 'DUPLICATE',
          message: duplicateMessage,
          businessKey,
          itemStats: result.itemStats,
        };
      }
      
      // Partial success - some items were new, some were duplicates
      if (result.itemStats && result.itemStats.duplicateItems > 0) {
        await ProcessingLog.findOneAndUpdate(
          { contentHash },
          {
            contentHash,
            fileName,
            fileType: 'REQUISITION',
            status: 'SUCCESS',
            businessKey,
            fileSize,
            itemStats: result.itemStats,
            processedAt: new Date(),
          },
          { upsert: true }
        );
        
        return {
          fileName,
          fileType: 'REQUISITION',
          status: 'SUCCESS',
          message: `Stored ${result.itemStats.newItems} new materials (${result.itemStats.duplicateItems} duplicates skipped)`,
          businessKey,
          recordId,
          itemStats: result.itemStats,
        };
      }
    }
    
    // Step 5: Log successful processing
    // Use findOneAndUpdate for all files to handle reprocessing and avoid duplicate key errors
    await ProcessingLog.findOneAndUpdate(
      { contentHash },
      {
        contentHash,
        fileName,
        fileType,
        status: 'SUCCESS',
        businessKey,
        fileSize,
        processedAt: new Date(),
      },
      { upsert: true }
    );
    
    return {
      fileName,
      fileType,
      status: 'SUCCESS',
      message: `Successfully processed ${getFileTypeName(fileType)} file`,
      businessKey,
      recordId,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to log the error
    try {
      const contentHash = generateNormalizedHash(content);
      await ProcessingLog.findOneAndUpdate(
        { contentHash },
        {
          contentHash,
          fileName,
          fileType: 'UNKNOWN',
          status: 'ERROR',
          errorMessage,
          fileSize,
          processedAt: new Date(),
        },
        { upsert: true }
      );
    } catch (logError) {
      console.error('Failed to log error to ProcessingLog:', logError);
    }
    
    return {
      fileName,
      fileType: 'UNKNOWN',
      status: 'ERROR',
      message: errorMessage,
    };
  }
}

/**
 * Process Batch XML and store in database
 * Implements ITEM-LEVEL duplicate detection:
 * - Each batch item is checked individually by batchNumber + itemCode
 * - Only new (non-duplicate) items are stored
 * - Files are still tracked for reference, but items are deduplicated
 */
async function processBatchXml(
  content: string, 
  fileName: string, 
  fileSize: number,
  contentHash: string
): Promise<{ 
  businessKey?: string; 
  recordId?: string; 
  duplicate: boolean;
  itemStats?: ItemLevelStats;
}> {
  const parseResult = await parseBatchRegistryXml(content);
  
  if (!parseResult.success || !parseResult.data) {
    throw new Error(parseResult.errors.join(', ') || 'Failed to parse Batch XML');
  }
  
  const data = parseResult.data;
  
  // Generate business key from file name and date range
  const businessKey = `BATCH-${fileName}`;
  
  // Check for exact file duplicate (same content hash)
  const existingExactMatch = await Batch.findOne({ contentHash });
  if (existingExactMatch) {
    // Build duplicate details for all items in the file
    const duplicateDetails: DuplicateItemDetail[] = data.batches.map(batch => ({
      batchNumber: batch.batchNumber,
      itemCode: batch.itemCode,
      itemName: batch.itemName || 'N/A',
      type: batch.type || 'Unknown',
      mfgDate: batch.mfgDate,
      expiryDate: batch.expiryDate,
      reason: 'Exact file already processed',
      existingFileName: existingExactMatch.fileName
    }));
    
    return { 
      businessKey, 
      duplicate: true,
      itemStats: {
        totalItems: data.batches.length,
        newItems: 0,
        duplicateItems: data.batches.length,
        duplicateDetails,
        successfulDetails: []  // No items were processed
      }
    };
  }
  
  // ITEM-LEVEL DUPLICATE DETECTION
  // Check each batch item individually against ALL existing records
  const newBatches: typeof data.batches = [];
  const duplicateDetails: DuplicateItemDetail[] = [];
  const successfulDetails: SuccessfulItemDetail[] = [];  // Track successfully processed items
  
  for (const batchItem of data.batches) {
    // Check if this specific batchNumber + itemCode combination exists anywhere
    const existingItem = await Batch.findOne({
      batches: {
        $elemMatch: {
          batchNumber: batchItem.batchNumber,
          itemCode: batchItem.itemCode
        }
      }
    });
    
    if (existingItem) {
      // This item already exists - add to duplicate details
      duplicateDetails.push({
        batchNumber: batchItem.batchNumber,
        itemCode: batchItem.itemCode,
        itemName: batchItem.itemName || 'N/A',
        type: batchItem.type || 'Unknown',
        mfgDate: batchItem.mfgDate,
        expiryDate: batchItem.expiryDate,
        reason: `Duplicate: Already exists in database`,
        existingFileName: existingItem.fileName
      });
    } else {
      // This is a new item - add to list and track for successful details
      newBatches.push(batchItem);
      successfulDetails.push({
        batchNumber: batchItem.batchNumber,
        itemCode: batchItem.itemCode,
        itemName: batchItem.itemName || 'N/A',
        type: batchItem.type || 'Unknown',
        mfgDate: batchItem.mfgDate,
        expiryDate: batchItem.expiryDate
      });
    }
  }
  
  const itemStats: ItemLevelStats = {
    totalItems: data.batches.length,
    newItems: newBatches.length,
    duplicateItems: duplicateDetails.length,
    duplicateDetails,
    successfulDetails
  };
  
  // If ALL items are duplicates, don't create a new record
  if (newBatches.length === 0) {
    return { 
      businessKey, 
      duplicate: true,
      itemStats 
    };
  }
  
  // Recalculate counts for new items only
  const exportCount = newBatches.filter(b => b.type === 'Export').length;
  const importCount = newBatches.filter(b => b.type === 'Import').length;
  
  // Re-assign serial numbers for the new items
  const reindexedBatches = newBatches.map((batch, index) => ({
    ...batch,
    srNo: index + 1
  }));
  
  // Store only the new items in database
  // Skip storing raw XML for files larger than 14MB (MongoDB 16MB limit)
  const shouldStoreRawContent = content.length <= MAX_RAW_CONTENT_SIZE;
  
  const batch = await Batch.create({
    fileName,
    fileSize,
    rawXmlContent: shouldStoreRawContent ? content : undefined,
    contentHash,
    parsingStatus: parseResult.warnings.length > 0 || duplicateDetails.length > 0 ? 'partial' : 'success',
    parsingErrors: [
      ...parseResult.warnings,
      ...(duplicateDetails.length > 0 ? [`${duplicateDetails.length} duplicate items were skipped`] : []),
      ...(!shouldStoreRawContent ? [`Raw XML content not stored (file exceeds 14MB limit)`] : [])
    ],
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    batches: reindexedBatches,
    totalBatches: reindexedBatches.length,
    exportCount,
    importCount,
  });
  
  return { 
    businessKey, 
    recordId: batch._id.toString(),
    duplicate: false,
    itemStats
  };
}

/**
 * Process Formula XML and store in database
 * Implements FORMULA-LEVEL duplicate detection with detailed tracking
 */
async function processFormulaXml(
  content: string, 
  fileName: string, 
  fileSize: number,
  contentHash: string
): Promise<{ 
  businessKey?: string; 
  recordId?: string; 
  duplicate: boolean;
  formulaStats?: FormulaLevelStats;
}> {
  // Use multi-formula parser to extract ALL formulas from the file
  const parseResult = await parseMultipleFormulasXml(content);
  
  if (!parseResult.success || parseResult.formulas.length === 0) {
    throw new Error(parseResult.errors.join(', ') || 'Failed to parse Formula XML - no formulas found');
  }
  
  console.log(`Processing ${parseResult.formulas.length} formula(s) from ${fileName}`);
  
  // Skip storing raw XML for files larger than 14MB (MongoDB 16MB limit)
  const shouldStoreRawContent = content.length <= MAX_RAW_CONTENT_SIZE;
  
  // Track statistics with detailed information
  const storedIds: string[] = [];
  const businessKeys: string[] = [];
  const duplicateDetails: DuplicateFormulaDetail[] = [];
  const successfulDetails: SuccessfulFormulaDetail[] = [];
  
  // Process each formula individually
  for (let i = 0; i < parseResult.formulas.length; i++) {
    const data = parseResult.formulas[i];
    
    // Extract formula details
    const productCode = data.masterFormulaDetails.productCode;
    const productName = data.masterFormulaDetails.productName || 'N/A';
    const revisionNo = data.masterFormulaDetails.revisionNo || '1';
    const genericName = data.masterFormulaDetails.genericName;
    const manufacturer = data.masterFormulaDetails.manufacturer;
    const businessKey = `FORMULA-${productCode}-REV${revisionNo}`;
    const uniqueIdentifier = `${productCode}_${revisionNo}_${uuidv4().slice(0, 8)}`;
    
    // Check for business-level duplicate
    // FIRST: Check by masterCardNo (MFC number) - this is the true unique identifier
    const masterCardNo = data.masterFormulaDetails.masterCardNo?.trim();
    let existing = null;
    
    if (masterCardNo && masterCardNo !== 'N/A') {
      existing = await Formula.findOne({
        'masterFormulaDetails.masterCardNo': masterCardNo
      });
    }
    
    // FALLBACK: If no masterCardNo match, check by productCode + revisionNo
    if (!existing) {
      existing = await Formula.findOne({
        'masterFormulaDetails.productCode': productCode,
        'masterFormulaDetails.revisionNo': revisionNo
      });
    }
    
    if (existing) {
      // MERGE STRATEGY: Instead of skipping, merge new item codes into existing formula
      // This ensures we don't lose unique item codes that exist in different files
      
      // Collect existing item codes from fillingDetails
      const existingItemCodes = new Set<string>();
      if (existing.fillingDetails && Array.isArray(existing.fillingDetails)) {
        existing.fillingDetails.forEach((fd: any) => {
          if (fd.productCode && fd.productCode !== 'N/A') {
            existingItemCodes.add(fd.productCode.trim());
          }
        });
      }
      
      // Collect existing item codes from processes (fillingProducts)
      if (existing.processes && Array.isArray(existing.processes)) {
        existing.processes.forEach((p: any) => {
          if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
            p.fillingProducts.forEach((fp: any) => {
              if (fp.productCode) {
                existingItemCodes.add(fp.productCode.trim());
              }
            });
          }
        });
      }
      
      // Find NEW filling details that don't exist in the current formula
      const newFillingDetails: typeof data.fillingDetails = [];
      if (data.fillingDetails && Array.isArray(data.fillingDetails)) {
        for (const fd of data.fillingDetails) {
          if (fd.productCode && fd.productCode !== 'N/A' && !existingItemCodes.has(fd.productCode.trim())) {
            newFillingDetails.push(fd);
            existingItemCodes.add(fd.productCode.trim()); // Add to set to prevent duplicates within same file
          }
        }
      }
      
      // Find NEW filling products from processes
      const newProcessesToMerge: typeof data.processes = [];
      if (data.processes && Array.isArray(data.processes)) {
        for (const process of data.processes) {
          if (process.fillingProducts && Array.isArray(process.fillingProducts)) {
            const newFillingProducts = process.fillingProducts.filter((fp: any) => {
              return fp.productCode && !existingItemCodes.has(fp.productCode.trim());
            });
            
            if (newFillingProducts.length > 0) {
              // Add these new filling products to the process
              newProcessesToMerge.push({
                ...process,
                fillingProducts: newFillingProducts
              });
              
              // Track the new item codes
              newFillingProducts.forEach((fp: any) => {
                if (fp.productCode) {
                  existingItemCodes.add(fp.productCode.trim());
                }
              });
            }
          }
        }
      }
      
      // If there are new items to add, update the existing formula
      if (newFillingDetails.length > 0 || newProcessesToMerge.length > 0) {
        const updatePayload: any = {};
        
        // Add new filling details to existing ones
        if (newFillingDetails.length > 0) {
          updatePayload.$push = updatePayload.$push || {};
          updatePayload.$push.fillingDetails = { $each: newFillingDetails };
        }
        
        // Merge new processes (add filling products to existing processes or add new processes)
        if (newProcessesToMerge.length > 0) {
          // For simplicity, we'll add the new filling products to existing processes
          // by matching process name, or add as new process if not found
          for (const newProcess of newProcessesToMerge) {
            const existingProcess = existing.processes?.find((p: any) => 
              p.processName === newProcess.processName || p.processNo === newProcess.processNo
            );
            
            if (existingProcess) {
              // Add filling products to existing process
              await Formula.updateOne(
                { 
                  _id: existing._id,
                  'processes.processName': newProcess.processName 
                },
                { 
                  $push: { 
                    'processes.$.fillingProducts': { $each: newProcess.fillingProducts || [] }
                  }
                }
              );
            } else {
              // Add as new process
              updatePayload.$push = updatePayload.$push || {};
              if (!updatePayload.$push.processes) {
                updatePayload.$push.processes = { $each: [] };
              }
              updatePayload.$push.processes.$each.push(newProcess);
            }
          }
        }
        
        // Apply updates if any
        if (Object.keys(updatePayload).length > 0) {
          await Formula.updateOne({ _id: existing._id }, updatePayload);
        }
        
        console.log(`Formula ${i + 1}/${parseResult.formulas.length}: MERGED ${newFillingDetails.length} new filling details, ${newProcessesToMerge.length} processes into existing ${masterCardNo || productCode}`);
        
        // Track as partial success (merged)
        successfulDetails.push({
          productCode,
          productName,
          revisionNo,
          genericName,
          manufacturer
        });
        storedIds.push(existing._id.toString());
        businessKeys.push(businessKey);
      } else {
        // No new items - true duplicate
        duplicateDetails.push({
          productCode,
          productName,
          revisionNo,
          genericName,
          manufacturer,
          reason: masterCardNo ? `MFC ${masterCardNo} already exists (no new items)` : 'Already exists in database',
          existingFileName: existing.fileName || 'Unknown'
        });
        console.log(`Formula ${i + 1}/${parseResult.formulas.length}: Duplicate (no new items) - ${masterCardNo || productCode}`);
      }
      continue;
    }
    
    // Store this formula in database (new formula)
    try {
      const formula = await Formula.create({
        uniqueIdentifier,
        fileName,
        fileSize: Math.round(fileSize / parseResult.formulas.length),
        rawXmlContent: shouldStoreRawContent && parseResult.formulas.length === 1 ? content : undefined,
        contentHash: parseResult.formulas.length === 1 ? contentHash : `${contentHash}_${i}`,
        parsingStatus: parseResult.warnings.length > 0 || !shouldStoreRawContent ? 'partial' : 'success',
        parsingErrors: [
          ...parseResult.warnings.filter(w => w.includes(`Formula ${i + 1}`)),
          ...(!shouldStoreRawContent ? [`Raw XML content not stored (file exceeds 14MB limit)`] : [])
        ],
        companyInfo: data.companyInfo,
        masterFormulaDetails: data.masterFormulaDetails,
        batchInfo: data.batchInfo,
        composition: data.composition,
        materials: data.materials,
        excipients: data.excipients || [],
        fillingDetails: data.fillingDetails,
        summary: data.summary,
        processes: data.processes || [],  // Add process-based data (MIXING, ASEPTIC FILLING, etc.)
        packingMaterials: data.packingMaterials || [],  // Add packing materials (MATTYPE=PM)
      });
      
      storedIds.push(formula._id.toString());
      businessKeys.push(businessKey);
      
      // Track successful details
      successfulDetails.push({
        productCode,
        productName,
        revisionNo,
        genericName,
        manufacturer
      });
      
      console.log(`Formula ${i + 1}/${parseResult.formulas.length}: Stored NEW - ${masterCardNo || productCode}`);
    } catch (saveError) {
      console.error(`Failed to store formula ${i + 1}:`, saveError);
    }
  }
  
  // Build formula stats
  const formulaStats: FormulaLevelStats = {
    totalFormulas: parseResult.totalFound,
    newFormulas: successfulDetails.length,
    duplicateFormulas: duplicateDetails.length,
    duplicateDetails,
    successfulDetails
  };
  
  // If ALL formulas were duplicates
  if (successfulDetails.length === 0) {
    return { 
      businessKey: businessKeys[0] || `FORMULA-${fileName}`,
      duplicate: true,
      formulaStats
    };
  }
  
  return { 
    businessKey: businessKeys.length > 1 ? `${businessKeys.length} formulas` : businessKeys[0],
    recordId: storedIds.length > 1 ? `${storedIds.length} records` : storedIds[0],
    duplicate: false,
    formulaStats
  };
}

/**
 * Run full ingestion process
 * Scans folder, processes all files, returns status
 */
export async function runIngestion(): Promise<IngestionStatus> {
  await connectToDatabase();
  
  // NOTE: We do NOT automatically clean up orphaned logs here.
  // ProcessingLog entries are the single source of truth for "has this file been processed".
  // When a user deletes a record from History, the DELETE handler cleans up the corresponding logs.
  
  const status: IngestionStatus = {
    isProcessing: true,
    totalFiles: 0,
    processed: 0,
    successful: 0,
    duplicates: 0,
    errors: 0,
    results: [],
  };
  
  // Scan for XML files
  const files = await scanFilesFolder();
  status.totalFiles = files.length;
  
  // Process each file
  for (const file of files) {
    const result = await processXmlFile(file);
    status.results.push(result);
    status.processed++;
    
    switch (result.status) {
      case 'SUCCESS':
        status.successful++;
        break;
      case 'DUPLICATE':
        status.duplicates++;
        break;
      case 'ERROR':
        status.errors++;
        break;
    }
  }
  
  status.isProcessing = false;
  return status;
}

/**
 * Get processing history from logs
 */
// Type alias for the result of ProcessingLog.find().lean()
interface ProcessingLogRecord {
  _id?: string;
  contentHash: string;
  fileName: string;
  fileType: string;
  status: string;
  businessKey?: string;
  errorMessage?: string;
  processedAt: Date;
  fileSize: number;
}

export async function getProcessingLogs(
  page: number = 1, 
  limit: number = 20
): Promise<{ logs: ProcessingLogRecord[]; total: number }> {
  await connectToDatabase();
  
  const skip = (page - 1) * limit;
  
  const [logs, total] = await Promise.all([
    ProcessingLog.find()
      .sort({ processedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ProcessingLog.countDocuments(),
  ]);

  return {
    logs: logs.map(log => ({
      ...log,
      _id: log._id?.toString(),
    })) as ProcessingLogRecord[],
    total,
  };
}

/**
 * Process COA XML and store in database
 * Handles BULK and FINISH stages
 */
async function processCOAXml(
  content: string,
  fileName: string,
  fileSize: number,
  contentHash: string
): Promise<{
  businessKey?: string;
  recordId?: string;
  duplicate: boolean;
}> {
  const parseResult = await parseCOAXml(content, fileName);
  
  if (!parseResult.success || !parseResult.data) {
    throw new Error(parseResult.errors.join(', ') || 'Failed to parse COA XML');
  }
  
  const record = parseResult.data;
  const businessKey = `${record.batchNumber}-${record.stage}`;
  
  // Check for duplicate in database
  const existing = await COA.findOne({ 
    batchNumber: record.batchNumber, 
    stage: record.stage 
  });
  
  if (existing) {
    if (existing.contentHash === contentHash) {
      return { businessKey, duplicate: true };
    } else {
      // Update existing record with new content
      await COA.findByIdAndUpdate(existing._id, {
        ...record,
        uploadedAt: new Date(),
        contentHash,
      });
      return { businessKey, recordId: existing._id.toString(), duplicate: false };
    }
  }
  
  // Create new record
  const newRecord = await COA.create({
    ...record,
    uploadedAt: new Date(),
    contentHash,
  });
  
  return { 
    businessKey, 
    recordId: newRecord._id.toString(), 
    duplicate: false 
  };
}

/**
 * Process Requisition XML and store in database
 * Implements ITEM-LEVEL duplicate detection:
 * - Each material item is checked individually by matReqDtlId
 * - Only new (non-duplicate) items are stored
 */
async function processRequisitionXml(
  content: string, 
  fileName: string, 
  fileSize: number,
  contentHash: string
): Promise<{ 
  businessKey?: string; 
  recordId?: string; 
  duplicate: boolean;
  itemStats?: ItemLevelStats;
}> {
  console.log('\n========================================');
  console.log('📦 REQUISITION XML PROCESSING STARTED');
  console.log('========================================');
  console.log(`📄 File: ${fileName}`);
  console.log(`📊 Size: ${(fileSize / 1024).toFixed(2)} KB`);
  console.log(`🔑 Content Hash: ${contentHash.substring(0, 16)}...`);
  
  const parseResult = await parseRequisitionXml(content);
  
  if (!parseResult.success || !parseResult.data) {
    console.log('❌ PARSE FAILED:', parseResult.errors.join(', '));
    throw new Error(parseResult.errors.join(', ') || 'Failed to parse Requisition XML');
  }
  
  const data = parseResult.data;
  
  console.log('\n📋 PARSE RESULTS:');
  console.log(`   Location: ${data.locationCode}`);
  console.log(`   Make: ${data.make}`);
  console.log(`   Total Batches Found: ${data.batches.length}`);
  console.log(`   Raw Materials (RM): ${data.rawMaterials.length}`);
  console.log(`   Primary Packaging (PPM): ${data.primaryPackaging.length}`);
  console.log(`   Packing Materials (PM): ${data.packingMaterials.length}`);
  console.log(`   Total Materials: ${data.rawMaterials.length + data.primaryPackaging.length + data.packingMaterials.length}`);
  
  if (parseResult.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    parseResult.warnings.forEach(w => console.log(`   - ${w}`));
  }
  
  // Generate business key from location and make
  const businessKey = `REQ-${data.locationCode || 'UNKNOWN'}-${data.make || 'UNKNOWN'}`;
  console.log(`\n🔑 Business Key: ${businessKey}`);
  
  // Check for exact file duplicate (same content hash)
  console.log('\n🔍 CHECKING FOR EXACT FILE DUPLICATE...');
  const existingExactMatch = await Requisition.findOne({ contentHash });
  if (existingExactMatch) {
    console.log(`⚠️ EXACT DUPLICATE: File already processed as "${existingExactMatch.fileName}"`);
    const totalMaterials = data.rawMaterials.length + data.primaryPackaging.length + data.packingMaterials.length;
    
    const duplicateDetails: DuplicateItemDetail[] = [
      ...data.rawMaterials,
      ...data.primaryPackaging,
      ...data.packingMaterials,
    ].map(mat => ({
      batchNumber: mat.matReqNo,
      itemCode: mat.materialCode,
      itemName: mat.materialName,
      type: mat.materialType,
      reason: 'Exact file already processed',
      existingFileName: existingExactMatch.fileName
    }));
    
    console.log('========================================\n');
    return { 
      businessKey, 
      duplicate: true,
      itemStats: {
        totalItems: totalMaterials,
        newItems: 0,
        duplicateItems: totalMaterials,
        duplicateDetails,
        successfulDetails: []
      }
    };
  }
  console.log('✅ No exact file duplicate found');
  
  // ITEM-LEVEL DUPLICATE DETECTION - OPTIMIZED
  // Fetch all existing matReqDtlIds in ONE query instead of one per item
  console.log('\n🔍 ITEM-LEVEL DUPLICATE DETECTION (OPTIMIZED)...');
  const allMaterials = [
    ...data.rawMaterials,
    ...data.primaryPackaging,
    ...data.packingMaterials,
  ];
  console.log(`   Total materials to check: ${allMaterials.length}`);
  
  // Get all matReqDtlIds from this file
  const allMatReqDtlIds = allMaterials.map(m => m.matReqDtlId);
  
  // Fetch existing IDs in ONE aggregation query
  console.log('   Fetching existing IDs from database...');
  const startTime = Date.now();
  
  const existingRecords = await Requisition.aggregate([
    {
      $project: {
        fileName: 1,
        allIds: {
          $reduce: {
            input: '$batches',
            initialValue: [],
            in: { $concatArrays: ['$$value', { $ifNull: ['$$this.materials.matReqDtlId', []] }] }
          }
        }
      }
    },
    { $unwind: '$allIds' },
    { $match: { allIds: { $in: allMatReqDtlIds } } },
    { $group: { _id: '$allIds', fileName: { $first: '$fileName' } } }
  ]);
  
  // Build a Set of existing IDs for O(1) lookup
  const existingIdMap = new Map<string, string>();
  for (const rec of existingRecords) {
    existingIdMap.set(rec._id, rec.fileName);
  }
  
  console.log(`   Query completed in ${Date.now() - startTime}ms`);
  console.log(`   Found ${existingIdMap.size} existing duplicate IDs`);
  
  const newMaterials: typeof allMaterials = [];
  const duplicateDetails: DuplicateItemDetail[] = [];
  const successfulDetails: SuccessfulItemDetail[] = [];
  
  // Now check each material against the map (O(1) per item)
  for (const material of allMaterials) {
    const existingFileName = existingIdMap.get(material.matReqDtlId);
    
    if (existingFileName) {
      duplicateDetails.push({
        batchNumber: material.matReqNo,
        itemCode: material.materialCode,
        itemName: material.materialName,
        type: material.materialType,
        reason: 'Duplicate: Already exists in database',
        existingFileName
      });
    } else {
      newMaterials.push(material);
      successfulDetails.push({
        batchNumber: material.matReqNo,
        itemCode: material.materialCode,
        itemName: material.materialName,
        type: material.materialType,
      });
    }
  }
  
  const itemStats: ItemLevelStats = {
    totalItems: allMaterials.length,
    newItems: newMaterials.length,
    duplicateItems: duplicateDetails.length,
    duplicateDetails,
    successfulDetails
  };
  
  console.log('\n📊 DUPLICATE DETECTION RESULTS:');
  console.log(`   ✅ New Materials: ${newMaterials.length}`);
  console.log(`   ⚠️ Duplicate Materials: ${duplicateDetails.length}`);
  
  // If ALL items are duplicates, don't create a new record
  if (newMaterials.length === 0) {
    console.log('\n❌ ALL ITEMS ARE DUPLICATES - No new record created');
    console.log('========================================\n');
    return { 
      businessKey, 
      duplicate: true,
      itemStats 
    };
  }
  
  // No longer categorizing materials into flat arrays here, they will be reconstructed from batches when queried
  // This avoids doubling the document size for large files (staying under BSON 16MB limit)
  
  // Filter batches to only include those with new materials
  // AND perform Master Formula validation for comparison
  console.log('\n🔍 VALIDATING AGAINST MASTER FORMULA FOR COMPARISON...');
  const batchesWithNewMaterials = await Promise.all(data.batches.map(async (batch) => {
    // Look up Formula by MFC Number (Master Card Number)
    const mfcNo = batch.mfcNo?.trim();
    let formula = null;
    if (mfcNo && mfcNo !== 'N/A') {
      formula = await Formula.findOne({ 'masterFormulaDetails.masterCardNo': mfcNo });
    }
    
    // Process materials
    const updatedMaterials = await Promise.all(batch.materials.map(async (mat) => {
      // Only keep if it's a new material (not a duplicate)
      const isNew = newMaterials.some(nm => nm.matReqDtlId === mat.matReqDtlId);
      if (!isNew) return null;
      
      // Validation logic
      if (formula) {
        // Try to find material in Formula by materialCode
        let formulaMatRequirement = null;
        
        // 1. Check in regular materials (RM)
        const regularMat = formula.materials?.find((m: any) => m.materialCode === mat.materialCode);
        if (regularMat) {
          formulaMatRequirement = regularMat.requiredQuantityStandardBatch || regularMat.requiredQuantity;
        }
        
        // 2. Check in packing materials (PM)
        if (!formulaMatRequirement) {
          const packingMat = formula.packingMaterials?.find((m: any) => m.materialCode === mat.materialCode);
          if (packingMat) {
            formulaMatRequirement = packingMat.reqAsPerStdBatchSize;
          }
        }
        
        // 3. Check in filling products materials
        if (!formulaMatRequirement) {
          formula.processes?.forEach((p: any) => {
            p.materials?.forEach((m: any) => {
              if (m.materialCode === mat.materialCode) {
                formulaMatRequirement = m.reqAsPerStdBatchSize || m.reqQty;
              }
            });
          });
        }
        
        if (formulaMatRequirement) {
          // Parse number from string like "37.5 GM" or "100"
          const formulaQty = parseFloat(String(formulaMatRequirement).replace(/[^\d.-]/g, ''));
          if (!isNaN(formulaQty)) {
            mat.masterFormulaQty = formulaQty;
            
            // Validate: check if qtyToIssue matches formula requirement
            // We use a small tolerance for floating point numbers
            const diff = Math.abs(mat.quantityToIssue - formulaQty);
            const tolerance = 0.001;
            
            if (diff <= tolerance) {
              mat.validationStatus = 'matched';
            } else {
              mat.validationStatus = 'mismatch';
              mat.variancePercent = (diff / formulaQty) * 100;
            }
          }
        }
      }
      
      return mat;
    }));
    
    // Filter out null materials (duplicates) and return updated batch
    const filteredMaterials = updatedMaterials.filter((m): m is RequisitionMaterial => m !== null);
    
    return {
      ...batch,
      materials: filteredMaterials
    };
  }));
  
  // Filter out batches that no longer have materials
  const finalBatches = batchesWithNewMaterials.filter(batch => batch.materials.length > 0);
  
  // Calculate validation stats
  let totalValidated = 0;
  let totalMismatched = 0;
  finalBatches.forEach(b => {
    b.materials.forEach(m => {
      if (m.validationStatus === 'matched') totalValidated++;
      if (m.validationStatus === 'mismatch') totalMismatched++;
    });
  });
  
  // Skip storing raw XML for large files
  const shouldStoreRawContent = content.length <= MAX_RAW_CONTENT_SIZE;
  
  // Store in database
  const requisition = await Requisition.create({
    uniqueIdentifier: `REQ-${uuidv4()}`,
    fileName,
    fileSize,
    rawXmlContent: shouldStoreRawContent ? content : undefined,
    contentHash,
    parsingStatus: parseResult.warnings.length > 0 || duplicateDetails.length > 0 ? 'partial' : 'success',
    parsingErrors: [
      ...parseResult.warnings,
      ...(duplicateDetails.length > 0 ? [`${duplicateDetails.length} duplicate items were skipped`] : []),
      ...(!shouldStoreRawContent ? [`Raw XML content not stored (file exceeds 14MB limit)`] : [])
    ],
    
    batches: finalBatches,
    
    totalBatches: finalBatches.length,
    totalMaterials: newMaterials.length,
    validatedCount: totalValidated,
    mismatchCount: totalMismatched,
    
    locationCode: data.locationCode,
    make: data.make,
  });
  
  console.log('\n✅ SUCCESSFULLY STORED IN DATABASE');
  console.log(`   Record ID: ${requisition._id.toString()}`);
  console.log(`   Batches Stored: ${finalBatches.length}`);
  console.log(`   Materials Stored: ${newMaterials.length}`);
  console.log('========================================\n');
  
  return { 
    businessKey, 
    recordId: requisition._id.toString(),
    duplicate: false,
    itemStats
  };
}
