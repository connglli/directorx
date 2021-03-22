import { gzip, gunzip } from './denoflate/mod.ts';

export function zip(input: string): Uint8Array {
  return gzip(new TextEncoder().encode(input), undefined);
}

export function unzip(input: Uint8Array): string {
  return new TextDecoder().decode(gunzip(input));
}
