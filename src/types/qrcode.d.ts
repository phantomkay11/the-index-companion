// The pure-JavaScript core of the qrcode package has no type declarations of its own.
declare module 'qrcode/lib/core/qrcode.js' {
  export function create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): {
    modules: { size: number; get(row: number, col: number): boolean | number };
  };
}
