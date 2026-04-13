import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

type ExcelFileInfo = {
  name: string;
  size: number;
  modifiedAt: string;
};

export async function GET(): Promise<NextResponse<{ files: ExcelFileInfo[] } | { error: string }>> {
  try {
    const excelDir = path.join(process.cwd(), 'excel');
    const entries = await fs.readdir(excelDir, { withFileTypes: true });

    const files: ExcelFileInfo[] = [];
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith('.xlsx')) continue;
      const fullPath = path.join(excelDir, ent.name);
      const st = await fs.stat(fullPath);
      files.push({
        name: ent.name,
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to list excel files';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

