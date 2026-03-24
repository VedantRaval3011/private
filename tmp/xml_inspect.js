const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\admin\\Desktop\\software\\private\\files\\MatInwRegi-01-04-2025 to 04-02-2026.XML', 'utf8');

// Find the first G_MATINWDTLID block
const match = content.match(/<G_MATINWDTLID>([\s\S]*?)<\/G_MATINWDTLID>/i);
if (match) {
    const block = match[1];
    const tags = new Set();
    const tagRegex = /<([A-Z0-9_]+)>/ig;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(block)) !== null) {
        tags.add(tagMatch[1]);
    }
    console.log("Tags found in G_MATINWDTLID:");
    console.log(Array.from(tags).join(', '));
    
    // Also print the values for these tags for the first item
    for (const tag of tags) {
        const valMatch = new RegExp(`<${tag}>([^<]*)<\/${tag}>`, 'i').exec(block);
        if (valMatch) {
            console.log(`${tag}: ${valMatch[1]}`);
        }
    }
} else {
    console.log("No G_MATINWDTLID block found.");
}
