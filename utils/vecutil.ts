export function dot(a: number[], b: number[]): number {
  return a.reduce((sum, x, i) => sum + x*b[i], 0);
}

export function norm(a: number[], n = 2): number {
  switch (n) {
  case 0:
    return a.filter(x => x != 0).length;
  case 1:
    return a.reduce((sum, x) => sum + Math.abs(x), 0);
  case 2:
    return Math.sqrt(a.reduce((sum, x) => sum + x * x, 0));
  case 3:
    return Math.cbrt(a.reduce((sum, x) => sum + x * x * x, 0));
  default:
    return Math.pow(
      a.reduce((sum, x) => sum + Math.pow(x, n), 0),
      1 / n
    );
  }
}