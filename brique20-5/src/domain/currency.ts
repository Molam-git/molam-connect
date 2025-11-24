export function toMinorUnits(value: string, minorUnits: number): bigint {
  const [int, frac = ""] = value.split(".");
  const padded = (frac + "0".repeat(minorUnits)).slice(0, minorUnits);
  return BigInt(int + padded);
}

export function fromMinorUnits(cents: bigint, minorUnits: number): string {
  const s = cents.toString().padStart(minorUnits + 1, "0");
  const i = s.slice(0, -minorUnits);
  const f = s.slice(-minorUnits);
  return minorUnits === 0 ? i : `${i}.${f}`;
}

export function bankersRound(amount: number): number {
  // Bankers rounding (half-even)
  const rounded = Math.round(amount);
  if (Math.abs(amount - rounded) === 0.5) {
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
  return rounded;
}