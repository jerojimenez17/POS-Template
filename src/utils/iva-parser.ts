export function parseExcelIva(ivaVal: string | number | undefined | null): { percent: number | null; hasLetter: boolean } {
  if (ivaVal === undefined || ivaVal === null) {
    return { percent: null, hasLetter: false };
  }
  const str = String(ivaVal).trim();
  if (str === "") {
    return { percent: null, hasLetter: false };
  }
  
  if (str.toUpperCase() === "A") {
    return { percent: 21, hasLetter: true };
  }
  
  // Try to parse percentage (e.g. "21%", "10.5%", or numbers "21", "10.5")
  const cleanStr = str.replace(/%$/, "").trim();
  const numericStr = cleanStr.replace(",", ".");
  const num = parseFloat(numericStr);
  if (!isNaN(num)) {
    return { percent: num, hasLetter: false };
  }
  
  return { percent: null, hasLetter: false };
}
