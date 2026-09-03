declare module "opentype.js" {
  export interface Path {
    toPathData(decimalPlaces?: number): string;
  }

  export interface Font {
    unitsPerEm: number;
    numGlyphs: number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: unknown): Path;
    getAdvanceWidth(text: string, fontSize?: number, options?: unknown): number;
  }

  export function parse(
    buffer: Uint8Array | ArrayBuffer,
    options?: { lowMemory?: boolean },
  ): Font;
}
