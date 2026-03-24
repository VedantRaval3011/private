const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

const headerBlocks = content.split(/<G_MATID>/i);
let out = '';
for (const headerBlock of headerBlocks) {
    if (headerBlock.includes('SIDDHAMBIKA IMPEX') && headerBlock.includes('BLOOMAGE')) {
        out += "Found Sid in header block.\n";
        const tags = ['MATMAKE', 'MAKE', 'ACNAME', 'MATINWDTLID'];
        const itemStartIndex = headerBlock.indexOf('<G_MATINWDTLID>');
        out += `Item block starts at index: ${itemStartIndex}\n`;
        const endItemIndex = headerBlock.indexOf(`</G_MATINWDTLID>`);
        out += `Item block ends at index: ${endItemIndex}\n`;
        
        for (const tag of tags) {
            const index = headerBlock.indexOf(`<${tag}>`);
            out += `Tag <${tag}> found at index: ${index}\n`;
        }
        out += "Let's see what is inside G_MATINWDTLID:\n";
        if (itemStartIndex !== -1) {
            const itemBlockStr = headerBlock.substring(itemStartIndex, endItemIndex);
            out += `Item block content size: ${itemBlockStr.length}\n`;
            out += `Is MATMAKE in item block? ${itemBlockStr.includes('<MATMAKE>')}\n`;
            out += `Is MAKE in item block? ${itemBlockStr.includes('<MAKE>')}\n`;
        }
        break;
    }
}
fs.writeFileSync('c:\\Users\\admin\\Desktop\\software\\private\\tmp\\test_header_out.txt', out);
