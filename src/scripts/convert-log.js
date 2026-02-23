
const fs = require('fs');

try {
  const content = fs.readFileSync('test_output_2.log', 'utf16le');
  fs.writeFileSync('test_output_2_utf8.log', content, 'utf8');
  console.log('Converted to test_output_2_utf8.log');
} catch (e) {
  console.error(e);
}
