/**
 * Analyze the ARNO tag for NEPANEXT records
 */
const fs = require('fs');

const FILE_PATH = 'c:\\Users\\admin\\Desktop\\software\\private\\files\\01-04-2024 to 31-03-2025.XML';

function extractTag(content, tagName) {
    const regex = new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`, 'i');
    const match = content.match(regex);
    if (match) return match[1].trim();
    return '';
}

async function analyze() {
    const content = fs.readFileSync(FILE_PATH, 'utf-8');

    // Find the NEPANEXT block
    const idx = content.indexOf('IWAIOPM2402724');
    const start = Math.max(0, idx - 3000);
    const end = Math.min(content.length, idx + 1500);
    const snippet = content.substring(start, end);

    console.log('=== XML CONTEXT AROUND IWAIOPM2402724 ===\n');

    // Split into lines for easier reading
    const lines = snippet.split('\n');
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed) {
            console.log(`${i}: ${trimmed}`);
        }
    });

    // Specifically look for ARNO tags
    console.log('\n\n=== ARNO TAGS IN THIS SECTION ===');
    const arnoMatches = snippet.match(/<ARNO>[^<]*<\/ARNO>/gi) || [];
    arnoMatches.forEach(m => console.log(`  ${m}`));

    console.log('\n=== MATINWNO TAGS IN THIS SECTION ===');
    const matinwnoMatches = snippet.match(/<MATINWNO>[^<]*<\/MATINWNO>/gi) || [];
    matinwnoMatches.forEach(m => console.log(`  ${m}`));
}

analyze();
