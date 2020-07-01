import { gzip, gunzip } from 'https://deno.land/x/denoflate/mod.ts';

export function zip(input: string): Uint8Array {
  return gzip(new TextEncoder().encode(input));
}

export function unzip(input: Uint8Array): string {
  return new TextDecoder().decode(gunzip(input));
}