import * as hash from 'https://jspm.dev/object-hash@2.0.3';
import { assertEquals } from 'https://deno.land/std/testing/asserts.ts';

const { MD5: md5, sha1 } = hash.default;
type HashFunc = typeof md5 | typeof sha1;
type HashAlgo = 'sha1' | 'md5';

export class NoSuchKeyError<K> extends Error {
  // eslint-disable-next-line
  constructor(k: K) {
    super(`NoSuchKeyError: key ${k} does not exist`);
  }
}

export type Entry<K, V> = {
  k: K;
  v: V;
}

export default class HashMap<K, V> {
  private fn: HashFunc;
  private sz = 0;
  private readonly data: { [k: string]: Entry<K, V>[] } = {};
  constructor(
    algo: HashAlgo = 'md5',
    private readonly eq: (a: K, b: K) => boolean = (a, b) => a == b
  ) {
    this.fn = algo == 'md5' ? md5 : sha1;
  }

  get size(): number {
    return this.sz;
  }

  get(k: K): V {
    const h = this.hash(k);
    if (!this.data[h]) {
      throw new NoSuchKeyError(k);
    }
    const es = this.data[h];
    for (const e of es) {
      if (this.eq(e.k, k)) {
        return e.v;
      }
    }
    throw new NoSuchKeyError(k);
  }

  getOrDefault(k: K, d: V): V {
    try {
      return this.get(k);
    } catch (e) {
      if (e instanceof NoSuchKeyError) {
        return d;
      }
      throw e;
    }
  }

  contains(k: K): boolean {
    try {
      this.get(k);
      return true;
    } catch (e) {
      if (e instanceof NoSuchKeyError) {
        return false;
      }
      throw e;
    }
  }

  set(k: K, v: V): void {
    const h = this.hash(k);
    if (!this.data[h]) {
      this.data[h] = [];
    }
    const es = this.data[h];
    for (let i = 0; i < es.length; i ++) {
      if (this.eq(es[i].k, k)) {
        es[i].v = v;
        return;
      }
    }
    this.data[h].push({k, v});
    this.sz += 1;
  }

  remove(k: K): void {
    const h = this.hash(k);
    if (!this.data[h]) {
      throw new NoSuchKeyError(k);
    }
    const es = this.data[h];
    for (let i = 0; i < es.length; i ++) {
      if (this.eq(es[i].k, k)) {
        es.splice(i, 1);
        this.sz -= 1;
        return;
      }
    }
    throw new NoSuchKeyError(k);
  }

  hash(k: K): string {
    return this.fn(k);
  }

  *[Symbol.iterator](): IterableIterator<Entry<K, V>> {
    for (const k in this.data) {
      yield* this.data[k];
    }
  }
}

if (import.meta.main) {
  const hm = new HashMap<NoSuchKeyError<number>, number>();
  const d = Number.POSITIVE_INFINITY;
  assertEquals(hm.size, 0);
  assertEquals(hm.getOrDefault(new NoSuchKeyError(1), d), d);
  const kvs: [NoSuchKeyError<number>, number][] = [
    [new NoSuchKeyError(1), -1],
    [new NoSuchKeyError(17), 2],
    [new NoSuchKeyError(14), -43],
    [new NoSuchKeyError(-13), -32],
    [new NoSuchKeyError(93), 93],
  ];
  const eqkvs: [NoSuchKeyError<number>, number][] = [
    [kvs[0][0], -123],
    [kvs[3][0], 921]
  ];
  const delkvs = kvs.filter((kv, i) => i <= 2);
  const reskvs = kvs.filter((kv, i) => i > 2);
  for (const kv of kvs) {
    hm.set(kv[0], kv[1]);
  }
  assertEquals(hm.size, kvs.length);
  for (const kv of kvs) {
    assertEquals(hm.contains(kv[0]), true);
    assertEquals(hm.get(kv[0]), kv[1]);
  }
  for (const kv of eqkvs) {
    hm.set(kv[0], kv[1]);
  }
  assertEquals(hm.size, kvs.length);
  for (const kv of eqkvs) {
    assertEquals(hm.contains(kv[0]), true);
    assertEquals(hm.get(kv[0]), kv[1]);
  }
  for (const kv of delkvs) {
    hm.remove(kv[0]);
  }
  assertEquals(hm.size, kvs.length - delkvs.length);
  for (const kv of delkvs) {
    assertEquals(hm.contains(kv[0]), false);
  }
  for (const kv of reskvs) {
    assertEquals(hm.contains(kv[0]), true);
  }
}