import { NextRequest, NextResponse } from 'next/server';
import { generateApqrDocx } from '@/lib/apqr-utils';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/apqr/generate
 * Generates an APQR DOCX file for a given product and year.
 * Returns the file as a binary download.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productCode, year } = body;

    if (!productCode || !year) {
      return NextResponse.json(
        { error: 'Product code and year are required' },
        { status: 400 }
      );
    }

    // Generate the DOCX buffer (uses JSZip, returns a valid Node Buffer)
    const buffer = await generateApqrDocx(productCode, year);

    // Save a copy to files/doc/
    const docDir = path.join(process.cwd(), 'files', 'doc');
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }
    const filename = `APQR_${productCode}_${year}.docx`;
    fs.writeFileSync(path.join(docDir, filename), buffer);

    // Return binary response — use Uint8Array to guarantee the body
    // is never re-encoded as text by Next.js / middleware.
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store, no-transform',
      },
    });
  } catch (error: any) {
    console.error('Error generating APQR DOCX:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate APQR DOCX' },
      { status: 500 }
    );
  }
}
