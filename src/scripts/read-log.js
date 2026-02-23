
const fs = require('fs');

try {
  const content = fs.readFileSync('test_output.log', 'utf8'); // Try utf8 first
  console.log(content);
} catch (e) {
  try {
    const content = fs.readFileSync('test_output.log', 'utf16le');
    console.log(content);
  } catch (e2) {
    console.error('Failed to read log', e2);
  }
}
