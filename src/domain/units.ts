// Scene geometry and saved lengths remain in meters.
export const FEET_PER_METER = 1 / 0.3048;
export const feet = (meters: number) => meters * FEET_PER_METER;
export const meters = (feet: number) => feet * 0.3048;
export function formatFeet(value: number, digits = 1) {
  return feet(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}
export function squareFeet(squareMeters: number): string {
  return (squareMeters * 10.76391041671).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}
