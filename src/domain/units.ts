// Scene geometry and saved lengths remain in meters.
export function squareFeet(squareMeters: number): string {
  return (squareMeters * 10.76391041671).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
}
