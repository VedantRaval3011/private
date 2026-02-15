
const fs = require('fs');
const { parseStringPromise } = require('xml2js');

// Copied from requisitionParser.ts
function healXmlContent(xmlContent) {
  let healed = xmlContent;
  
  // Check if XML appears truncated
  // Modified to be generic or just rely on it not ending with the specific tag if we want,
  // but let's stick to the logic that if it's truncated it won't end with the root tag.
  // Actually, we can just run it if it doesn't look like valid XML at the end.
  // The original code checks for </MATREQ>. 
  // Let's assume we want to run it.
  
  // Find unclosed tags and close them
  const tagStack = [];
  const tagPattern = /<\/?([A-Z_][A-Z0-9_]*)[^>]*>/gi;
  let match;
  
  while ((match = tagPattern.exec(healed)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      
      if (fullTag.startsWith('</')) {
      // Closing tag - pop from stack
      if (tagStack.length > 0 && tagStack[tagStack.length - 1].toUpperCase() === tagName.toUpperCase()) {
          tagStack.pop();
      }
      } else if (!fullTag.endsWith('/>')) {
      // Opening tag - push to stack
      tagStack.push(tagName);
      }
  }
  
  // Close remaining open tags in reverse order
  while (tagStack.length > 0) {
      const tag = tagStack.pop();
      healed += `</${tag}>`;
  }
  
  return healed;
}

async function run() {
    console.log('Starting test with healing...');
    const filePath = 'c:\\Dev\\private\\files\\Vet-MatReq-01-04-2025 to 31-12-2025.XML';
    
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`Read ${content.length} characters.`);

        // Heal
        console.log('Healing XML...');
        const healed = healXmlContent(content);
        console.log(`Healed length: ${healed.length}`);
        console.log(`Healed end: ${healed.slice(-100)}`);

        // Parse
        console.log('Parsing XML...');
        const parsed = await parseStringPromise(healed, {
            explicitArray: false,
            ignoreAttrs: true,
            trim: true,
        });
        console.log('XML parsed successfully.');
        
        // Check root
        const keys = Object.keys(parsed);
        const rootKey = keys.find(key => 
            key.toUpperCase().startsWith('MATREQ') || 
            key.toLowerCase() === 'matreq'
        );
        
        if (rootKey) {
            console.log(`SUCCESS: Found root key "${rootKey}"`);
            const batchList = parsed[rootKey].LIST_G_BATCHSIZEBC?.G_BATCHSIZEBC;
            if (batchList) {
                 const count = Array.isArray(batchList) ? batchList.length : 1;
                 console.log(`Found ${count} batches.`);
            } else {
                console.log('No batches found under root.');
            }
        } else {
            console.error('FAILURE: No MATREQ root found.');
        }

    } catch (err) {
        console.error('ERROR:', err);
    }
}

run();
