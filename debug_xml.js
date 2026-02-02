const fs = require('fs');
const path = 'c:\\Users\\admin\\Desktop\\software\\private\\files\\01-04-2025 to 01-02-2026.XML';

try {
    // Read first 2000 bytes/chars
    const buffer = Buffer.alloc(4000);
    const fd = fs.openSync(path, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 4000, 0);
    fs.closeSync(fd);

    console.log(`Bytes read: ${bytesRead}`);
    console.log('--- Content (utf8) ---');
    console.log(buffer.toString('utf8', 0, bytesRead));

    console.log('--- Content (utf16le) ---');
    console.log(buffer.toString('utf16le', 0, bytesRead));
} catch (err) {
    console.error(err);
}
