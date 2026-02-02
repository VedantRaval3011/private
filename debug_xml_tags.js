const fs = require('fs');
const path = 'c:\\Users\\admin\\Desktop\\software\\private\\files\\01-04-2025 to 01-02-2026.XML';

try {
    // Read first 1MB
    const buffer = Buffer.alloc(1024 * 1024);
    const fd = fs.openSync(path, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const content = buffer.toString('utf8', 0, bytesRead);

    console.log('Searching for tags...');

    const tags = ['G_MATINWDTLID', 'MATINW', 'INWO', 'VENDORNAME', 'ARNO', 'AR_NO', 'LIST_G_MATINWDTLID'];

    tags.forEach(tag => {
        const index = content.indexOf(tag);
        if (index !== -1) {
            console.log(`Found ${tag} at index ${index}`);
            // Print context
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + 100);
            console.log(`Context: ...${content.substring(start, end)}...`);
        } else {
            console.log(`Tag ${tag} NOT FOUND`);
        }
    });

    // Also print first 500 chars to see header again
    console.log('\n--- Header ---');
    console.log(content.substring(0, 500));

} catch (err) {
    console.error(err);
}
