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
import { parseBatchRegistryXml, parseFormulaXml } from './xmlParser';
import ProcessingLog from '@/models/ProcessingLog';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import { v4 as uuidv4 } from 'uuid';
import type { 
  XmlFileInfo, 
  IngestionResult, 
  IngestionStatus,
  XmlFileType,
  ItemLevelStats,
  DuplicateItemDetail,
  SuccessfulItemDetail
} from '@/types/ingestion';

// Files folder path (relative to project root)
const FILES_FOLDER = path.join(process.cwd(), 'files');

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
      
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      xmlFiles.push({
        fileName,
        filePath,
        fileSize: stats.size,
        content,
      });
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
    const existingLog = await ProcessingLog.findOne({ contentHash });
    if (existingLog) {
      return {
        fileName,
        fileType: existingLog.fileType as XmlFileType,
        status: 'DUPLICATE',
        message: `File already processed on ${existingLog.processedAt.toISOString()}`,
        businessKey: existingLog.businessKey,
      };
    }
    
    // Step 3: Detect file type from content
    const fileType = detectXmlType(content);
    
    if (fileType === 'UNKNOWN') {
      // Log the error
      await ProcessingLog.create({
        contentHash,
        fileName,
        fileType: 'UNKNOWN',
        status: 'ERROR',
        errorMessage: 'Could not determine XML file type from content',
        fileSize,
      });
      
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
        
        await ProcessingLog.create({
          contentHash,
          fileName,
          fileType: 'BATCH',
          status: 'DUPLICATE',
          businessKey,
          fileSize,
          itemStats: result.itemStats,  // Store duplicate details
        });
        
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
        await ProcessingLog.create({
          contentHash,
          fileName,
          fileType: 'BATCH',
          status: 'SUCCESS',
          businessKey,
          fileSize,
          itemStats: result.itemStats,  // Store duplicate details
        });
        
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
        await ProcessingLog.create({
          contentHash,
          fileName,
          fileType: 'FORMULA',
          status: 'DUPLICATE',
          businessKey,
          fileSize,
        });
        
        return {
          fileName,
          fileType: 'FORMULA',
          status: 'DUPLICATE',
          message: `Formula already exists with key: ${businessKey}`,
          businessKey,
        };
      }
    }
    
    // Step 5: Log successful processing
    await ProcessingLog.create({
      contentHash,
      fileName,
      fileType,
      status: 'SUCCESS',
      businessKey,
      fileSize,
    });
    
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
      await ProcessingLog.create({
        contentHash,
        fileName,
        fileType: 'UNKNOWN',
        status: 'ERROR',
        errorMessage,
        fileSize,
      });
    } catch {
      // Ignore logging errors
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
  const batch = await Batch.create({
    fileName,
    fileSize,
    rawXmlContent: content,
    contentHash,
    parsingStatus: parseResult.warnings.length > 0 || duplicateDetails.length > 0 ? 'partial' : 'success',
    parsingErrors: [
      ...parseResult.warnings,
      ...(duplicateDetails.length > 0 ? [`${duplicateDetails.length} duplicate items were skipped`] : [])
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
 */
async function processFormulaXml(
  content: string, 
  fileName: string, 
  fileSize: number,
  contentHash: string
): Promise<{ businessKey?: string; recordId?: string; duplicate: boolean }> {
  const parseResult = await parseFormulaXml(content);
  
  if (!parseResult.success || !parseResult.data) {
    throw new Error(parseResult.errors.join(', ') || 'Failed to parse Formula XML');
  }
  
  const data = parseResult.data;
  
  // Generate business key from formula details
  const productCode = data.masterFormulaDetails.productCode;
  const revisionNo = data.masterFormulaDetails.revisionNo || '1';
  const businessKey = `FORMULA-${productCode}-REV${revisionNo}`;
  const uniqueIdentifier = `${productCode}_${revisionNo}_${uuidv4().slice(0, 8)}`;
  
  // Check for business-level duplicate using multiple criteria
  // 1. Check by contentHash (exact file match)
  // 2. Check by fileName (same file processed before)
  // 3. Check by productCode (same formula data)
  const existing = await Formula.findOne({
    $or: [
      { contentHash },
      { fileName },
      { 'masterFormulaDetails.productCode': productCode }
    ]
  });
  
  if (existing) {
    return { businessKey, duplicate: true };
  }
  
  // Store in database
  const formula = await Formula.create({
    uniqueIdentifier,
    fileName,
    fileSize,
    rawXmlContent: content,
    contentHash,
    parsingStatus: parseResult.warnings.length > 0 ? 'partial' : 'success',
    parsingErrors: parseResult.warnings,
    companyInfo: data.companyInfo,
    masterFormulaDetails: data.masterFormulaDetails,
    batchInfo: data.batchInfo,
    composition: data.composition,
    materials: data.materials,
    excipients: data.excipients || [],
    fillingDetails: data.fillingDetails,
    summary: data.summary,
  });
  
  return { 
    businessKey, 
    recordId: formula._id.toString(),
    duplicate: false 
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
