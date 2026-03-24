const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

const match = content.match(/<G_MATINWDTLID>([\s\S]*?)<\/G_MATINWDTLID>/i);
if (match) {
    const block = match[1];
    const tags = new Set();
    const tagRegex = /<([A-Z0-9_]+)>([^<]*)<\/\1>/ig;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(block)) !== null) {
        const tag = tagMatch[1];
        const val = tagMatch[2];
        if (tag.includes('MAKE') || tag.includes('MFG') || tag.includes('MANU')) {
           console.log(`Tag: ${tag} = ${val}`);
        } else if (val && (val.includes('LTD') || val.includes('LLP') || val.toLowerCase().includes('impex'))) {
           console.log(`Possible Company Tag: ${tag} = ${val}`);
        }
    }
}
