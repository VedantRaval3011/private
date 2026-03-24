const fs = require('fs');

function decodeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function extractTag(content, tagName) {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
    const match = content.match(regex);
    if (match) return decodeHtml(match[1].trim());
    return '';
}

const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

const blocks = content.split('<G_MATINWDTLID>');
for (const block of blocks) {
    if (block.includes('SIDDHAMBIKA IMPEX')) {
        const cleanBlock = block.split(/<\/G_MATINWDTLID>/i)[0];
        
        const matMake = extractTag(cleanBlock, 'MATMAKE');
        const make = extractTag(cleanBlock, 'MAKE');
        
        console.log(`MATMAKE parsed: "${matMake}"`);
        console.log(`MAKE parsed: "${make}"`);
        
        const manufacturedBy = matMake || make;
        console.log(`Resulting manufacturedBy: "${manufacturedBy}"`);
        break;
    }
}
