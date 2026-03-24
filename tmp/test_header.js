const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

const headerBlocks = content.split(/<G_MATID>/i);
for (const headerBlock of headerBlocks) {
    if (headerBlock.includes('SIDDHAMBIKA IMPEX') && headerBlock.includes('BLOOMAGE')) {
        console.log("Found Sid in header block.");
        const tags = ['MATMAKE', 'MAKE', 'ACNAME', 'MATINWDTLID', 'G_MATINWDTLID'];
        for (const tag of tags) {
            const index = headerBlock.indexOf(`<${tag}>`);
            const endItemIndex = headerBlock.indexOf(`</G_MATINWDTLID>`);
            console.log(`Tag <${tag}> found at index: ${index}, is before item end? ${index < endItemIndex}`);
        }
        break;
    }
}
