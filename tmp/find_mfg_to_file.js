const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

const blocks = content.split('<G_MATINWDTLID>');
let output = '';
for (const block of blocks) {
    if (block.includes('SIDDHAMBIKA IMPEX')) {
        output += "Found block with SIDDHAMBIKA IMPEX. Tags:\n";
        const tagRegex = /<([A-Z0-9_]+)>([^<]*)<\/\1>/ig;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(block)) !== null) {
            output += `${tagMatch[1]}: ${tagMatch[2]}\n`;
        }
        break;
    }
}
fs.writeFileSync('c:\\Users\\admin\\Desktop\\software\\private\\tmp\\output.txt', output);
