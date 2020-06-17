import { base64 } from './deps.ts';

/** Encode an utf-8 string to a base64 string */
export function encode(str: string): string {
  return base64.encode(new TextEncoder().encode(str));
}

/** Decode a base64 string to an utf-8 string */
export function decode(str: string): string {
  return new TextDecoder().decode(base64.decode(str));
}

