import * as base64 from 'https://deno.land/std/encoding/base64.ts';

/** Encode an utf-8 string to a base64 string */
export function encode(str: string): string {
  return base64.encode(new TextEncoder().encode(str));
}

/** Decode a base64 string to an utf-8 string */
export function decode(str: string): string {
  return new TextDecoder().decode(base64.decode(str));
}

/** Decode a base64 string to an array buffer */
export function decodeToArrayBuffer(str: string): ArrayBuffer {
  return base64.decode(str);
}
