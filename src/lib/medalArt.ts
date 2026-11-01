// Original polygon seals. Both SVG and Canvas use the same 64 × 72 design.
export const ribbon =
  'M13 44 9 69 24 62 31 69 36 45M32 45 38 70 49 62 57 67 50 42'
export const seal = 'M32 2 55 15 58 40 32 55 6 40 9 15Z'
export function sealLines(id: number) {
  const sides = 3 + (id % 6)
  const points = Array.from({ length: sides }, (_, j) => {
    const a = (j * 2 * Math.PI) / sides - Math.PI / 2
    return [32 + Math.cos(a) * 15, 28 + Math.sin(a) * 15].join(' ')
  })
  const emblem = ['M22 29h20', 'M24 32l8-10 8 10', 'M23 24l9 10 9-10'][
    Math.floor(id / 6)
  ]
  return 'M' + points.join(' L') + 'Z ' + emblem
}
