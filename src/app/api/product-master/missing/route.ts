import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ProductMaster from '@/models/ProductMaster';
import Batch from '@/models/Batch';

interface MissingProduct {
  itemCode: string;
  itemName: string;
  department: string;
  productType: string;
  batchCount: number;
  sampleBatchNumbers: string[];
}

/**
 * GET /api/product-master/missing
 * Returns products found in batch data but missing from Product Master
 */
export async function GET() {
  try {
    await connectToDatabase();

    // Get all product codes from ProductMaster
    const pmProducts = await ProductMaster.find({}, { productCode: 1 }).lean();
    const pmCodeSet = new Set(pmProducts.map((p: any) => p.productCode?.trim().toUpperCase()));

    // Aggregate unique item codes from all batch records
    const batchAgg = await Batch.aggregate([
      { $unwind: '$batches' },
      {
        $group: {
          _id: '$batches.itemCode',
          itemName: { $first: '$batches.itemName' },
          department: { $first: '$batches.department' },
          productType: { $first: '$batches.type' },
          batchCount: { $sum: 1 },
          sampleBatchNumbers: { $addToSet: '$batches.batchNumber' },
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Filter: item codes that are NOT in ProductMaster
    const missing: MissingProduct[] = batchAgg
      .filter((item: any) => item._id && !pmCodeSet.has(item._id?.trim().toUpperCase()))
      .map((item: any) => ({
        itemCode: item._id,
        itemName: item.itemName || 'N/A',
        department: item.department || 'N/A',
        productType: item.productType || 'N/A',
        batchCount: item.batchCount,
        sampleBatchNumbers: (item.sampleBatchNumbers as string[]).slice(0, 5),
      }));

    return NextResponse.json({
      success: true,
      missing,
      totalMissing: missing.length,
      totalBatchProducts: batchAgg.length,
      totalPMProducts: pmProducts.length,
    });
  } catch (error) {
    console.error('Error checking missing products:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to check missing products' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/product-master/missing
 * Adds selected missing products to Product Master
 */
export async function POST(request: Request) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const products: { itemCode: string; itemName: string; department: string; productType: string }[] = body.products;

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ success: false, message: 'No products provided' }, { status: 400 });
    }

    // Check which ones already exist to avoid duplicates
    const existingCodes = await ProductMaster.find(
      { productCode: { $in: products.map(p => p.itemCode) } },
      { productCode: 1 }
    ).lean();
    const existingSet = new Set(existingCodes.map((p: any) => p.productCode?.trim().toUpperCase()));

    const toInsert = products.filter(p => !existingSet.has(p.itemCode?.trim().toUpperCase()));

    if (toInsert.length === 0) {
      return NextResponse.json({ success: false, message: 'All selected products already exist in Product Master' }, { status: 409 });
    }

    const docs = toInsert.map(p => ({
      productCode: p.itemCode,
      productName: p.itemName !== 'N/A' ? p.itemName : p.itemCode,
      department: p.department !== 'N/A' ? p.department : 'N/A',
      productType: p.productType || 'N/A',
      masterCardNo: 'N/A',
      storageCondition: 'N/A',
      therapeuticCategory: 'N/A',
      sourceFile: 'added-from-batch-data',
      processedAt: new Date(),
    }));

    await ProductMaster.insertMany(docs);

    return NextResponse.json({
      success: true,
      added: toInsert.length,
      skipped: products.length - toInsert.length,
      message: `Added ${toInsert.length} product(s) to Product Master`,
    });
  } catch (error) {
    console.error('Error adding missing products:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to add products' },
      { status: 500 }
    );
  }
}
