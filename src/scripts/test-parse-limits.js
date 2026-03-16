const limitStrings = [
  "The average net volume of the contents of 10 containers is not less than the nominal amount (10.0 ml) and the net content of any single container is not less than 91.0% (9.1 ml) and not more than 109.0% (10.9 ml) of labelled amount (10.0 ml).",
  "Between 9.1 ml and 10.9 ml",
  "9.1 - 10.9",
  "NLT 90.0% and NMT 110.0%",
  "not less than 91.0% (9.1 ml) and not more than 109.0% (10.9 ml)",
  "90% to 110%",
  "120.00000"
];

function parseLimits(limitString) {
  if (!limitString) return { lsl: null, usl: null };
  const cleanStr = limitString.toLowerCase();
  
  // 1. First, check if there are explicit percentages with paren values: "91.0% (9.1 ml)"
  // Extract all (number unit) patterns:
  const parenMatches = [...cleanStr.matchAll(/\(([\d.]+)\s*(?:ml|mg|g|mcg|L|kg|w\/v|w\/w)?\)/g)];
  if (parenMatches.length > 0) {
      // Find all unique values in parentheses
      const nums = [...new Set(parenMatches.map(m => parseFloat(m[1])))].filter(n => !isNaN(n));
      if (nums.length >= 2) {
          // If we have "10.0", "9.1", "10.9" => sort them and take the outer bounds if they're not all the same, 
          // or we can remove the "nominal" amount if it equals the average of min and max?
          // Actually, just sorting all unique values and taking [0] and [length-1] is safe
          nums.sort((a,b) => a-b);
          return { lsl: nums[0], usl: nums[nums.length - 1] };
      }
  }

  // 2. Look for explicit NLT / NMT with or without units, but ignore percentages if there are better ones?
  // Let's just extract all numbers
  const allNumbers = [...cleanStr.matchAll(/[-+]?[0-9]*\.?[0-9]+/g)].map(m => parseFloat(m[0]));
  const stringWithoutPercents = cleanStr.replace(/[-+]?[0-9]*\.?[0-9]+\s*%/g, '');
  const nonPercentNumbers = [...stringWithoutPercents.matchAll(/[-+]?[0-9]*\.?[0-9]+/g)].map(m => parseFloat(m[0]));
  
  if (nonPercentNumbers.length >= 2) {
      // If we see "10" (from 10 containers) we should be careful. 
      // It's safer to filter out simple integers like "10" if there are decimal numbers, but maybe not.
      // Easiest is to take the distinct numbers.
      const uniqueNonPercent = [...new Set(nonPercentNumbers)];
      if (uniqueNonPercent.length >= 2) {
          // E.g. [10, 10.0, 9.1, 10.9] => 9.1 and 10.9
          uniqueNonPercent.sort((a,b) => a-b);
          
          return { lsl: uniqueNonPercent[0], usl: uniqueNonPercent[uniqueNonPercent.length - 1] };
      }
  }

  // Fallback to basic extraction of any numbers
  const matches = limitString.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!matches || matches.length < 2) return { lsl: null, usl: null };
  const floatMatches = matches.map(m => parseFloat(m));
  
  return { lsl: Math.min(...floatMatches), usl: Math.max(...floatMatches) };
}

limitStrings.forEach(str => {
    console.log(`"${str}"`);
    console.log(parseLimits(str));
    console.log('---');
});
