export function amplitudeToDB(amplitude: number): number {
  return 20 * Math.log10(amplitude);
} 