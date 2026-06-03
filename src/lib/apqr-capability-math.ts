/**
 * Pure process-capability math (no DB / Node deps).
 * Shared by apqr-utils, bulk-calculation page, and formula-data API.
 */

export interface ProcessCapabilityResults {
  average: number;
  max: number;
  min: number;
  lsl: number;
  usl: number;
  sigmaEstimated: number;
  sigmaSample: number;
  cpku: number;
  cpkl: number;
  cpk: number;
  cp: number;
  ppku: number;
  ppkl: number;
  ppk: number;
  pp: number;
  isCapable: boolean;
}

/** Parses LSL/USL from COA limit strings (ranges, NLT/NMT, parenthesized pairs, etc.). */
export function parseLimits(limitString: string): { lsl: number | null; usl: number | null } {
  if (!limitString?.trim()) return { lsl: null, usl: null };
  const cleanStr = limitString.toLowerCase();

  const parenMatches = [...cleanStr.matchAll(/\(([\d.]+)\s*(?:ml|mg|g|mcg|l|kg|w\/v|w\/w|%)?\)/g)];
  if (parenMatches.length > 0) {
    const nums = [...new Set(parenMatches.map(m => parseFloat(m[1])))].filter(n => !isNaN(n));
    if (nums.length >= 2) {
      nums.sort((a, b) => a - b);
      return { lsl: nums[0], usl: nums[nums.length - 1] };
    }
  }

  let lsl: number | null = null;
  let usl: number | null = null;

  const nltMatch = cleanStr.match(/(?:not less than|nlt)\s*([\d.]+)/);
  if (nltMatch) lsl = parseFloat(nltMatch[1]);

  const nmtMatch = cleanStr.match(/(?:not more than|nmt)\s*([\d.]+)/);
  if (nmtMatch) usl = parseFloat(nmtMatch[1]);

  if (lsl !== null && usl !== null && !isNaN(lsl) && !isNaN(usl)) {
    return { lsl: Math.min(lsl, usl), usl: Math.max(lsl, usl) };
  }

  const rangeMatch = cleanStr.match(/([\d.]+)\s*(?:ml|mg|g|mcg|l|kg|w\/v|w\/w|%)?\s*(?:-|to|and)\s*([\d.]+)/);
  if (rangeMatch) {
    const n1 = parseFloat(rangeMatch[1]);
    const n2 = parseFloat(rangeMatch[2]);
    if (!isNaN(n1) && !isNaN(n2)) {
      return { lsl: Math.min(n1, n2), usl: Math.max(n1, n2) };
    }
  }

  const matches = cleanStr.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!matches || matches.length < 2) {
    return { lsl: lsl !== null && !isNaN(lsl) ? lsl : null, usl: usl !== null && !isNaN(usl) ? usl : null };
  }

  const floatMatches = matches.map(m => parseFloat(m));
  const nonTenMatches = floatMatches.filter(n => n !== 10);
  if (nonTenMatches.length >= 2) {
    return { lsl: Math.min(nonTenMatches[0], nonTenMatches[1]), usl: Math.max(nonTenMatches[0], nonTenMatches[1]) };
  }

  return { lsl: Math.min(floatMatches[0], floatMatches[1]), usl: Math.max(floatMatches[0], floatMatches[1]) };
}

function calculateAverage(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((acc, val) => acc + val, 0) / data.length;
}

function calculateSampleStdDev(data: number[], mean: number): number {
  if (data.length < 2) return 0;
  const sumSq = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSq / (data.length - 1));
}

/** Estimated σ via moving range (d2 = 1.128 for n = 2). */
function calculateEstimatedStdDevMR(data: number[]): number {
  if (data.length < 2) return 0;
  let mrSum = 0;
  for (let i = 1; i < data.length; i++) {
    mrSum += Math.abs(data[i] - data[i - 1]);
  }
  return (mrSum / (data.length - 1)) / 1.128;
}

/** Cp, Cpk, Pp, Ppk — same formulas as APQR Section 5.3.1 / 5.3.2 tables. */
export function calculateProcessCapability(data: number[], limitStr: string): ProcessCapabilityResults | null {
  const nums = data.filter(n => !isNaN(n));
  if (nums.length < 2) return null;

  const { lsl, usl } = parseLimits(limitStr);
  if (lsl === null || usl === null) return null;

  const average = calculateAverage(nums);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const sigmaSample = calculateSampleStdDev(nums, average);
  const sigmaEst = calculateEstimatedStdDevMR(nums);
  if (sigmaEst === 0 || sigmaSample === 0) return null;

  const cpku = (usl - average) / (3 * sigmaEst);
  const cpkl = (average - lsl) / (3 * sigmaEst);
  const cpk = Math.min(cpku, cpkl);
  const cp = (usl - lsl) / (6 * sigmaEst);
  const ppku = (usl - average) / (3 * sigmaSample);
  const ppkl = (average - lsl) / (3 * sigmaSample);
  const ppk = Math.min(ppku, ppkl);
  const pp = (usl - lsl) / (6 * sigmaSample);
  const isCapable = cpk > 1.33 && cp > 1.33 && ppk > 1.33 && pp > 1.33;

  return {
    average, max, min, lsl, usl,
    sigmaEstimated: sigmaEst, sigmaSample,
    cpku, cpkl, cpk, cp,
    ppku, ppkl, ppk, pp,
    isCapable,
  };
}
