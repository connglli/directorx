import { assertEquals } from 'https://deno.land/std@0.60.0/testing/asserts.ts';

type Vector = number[];

export function sum(a: Vector): number {
  return a.reduce((sum, cur) => sum + cur, 0);
}

export function dot(a: Vector, b: Vector): number {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

export function norm(a: Vector, n = 2): number {
  switch (n) {
    case 0:
      return a.filter((x) => x != 0).length;
    case 1:
      return sum(a.map(Math.abs));
    case 2:
      return Math.sqrt(sum(a.map((x) => x * x)));
    case 3:
      return Math.cbrt(sum(a.map((x) => x * x * x)));
    default:
      return Math.pow(sum(a.map((x) => Math.pow(x, n))), 1 / n);
  }
}

export type WordFreq = {
  [word: string]: number;
};

export type WordVec = {
  words: string[];
  vector: Vector;
};

export function freq2vec(freq: WordFreq, words = Object.keys(freq)): WordVec {
  return {
    words: words.slice(),
    vector: words.map((w) => freq[w] ?? 0),
  };
}

export function tf(doc: WordFreq): WordFreq {
  const numOfWords = sum(Object.values(doc));
  const tf: WordFreq = {};
  for (const w in doc) {
    tf[w] = doc[w] / numOfWords;
  }
  return tf;
}

export function idf(doc: WordFreq, docs: WordFreq[]): WordFreq {
  const numOfDocs = docs.length;
  const cache = new Map<string, number>();
  const idf: WordFreq = {};
  for (const w in doc) {
    let numOfDocsContainingW = 0;
    if (cache.has(w)) {
      numOfDocsContainingW = cache.get(w)!;
    } else {
      numOfDocsContainingW = docs.filter(
        (d) => d[w] !== undefined && d[w] !== 0
      ).length;
      cache.set(w, numOfDocsContainingW);
    }
    idf[w] = Math.log(numOfDocs / (1 + numOfDocsContainingW));
  }
  return idf;
}

export function tfidf(docs: WordFreq[]): WordFreq[] {
  return docs.map((d) => {
    const tfidf: WordFreq = {};
    const tfTerm = tf(d);
    const idfTerm = idf(d, docs);
    for (const w in d) {
      tfidf[w] = tfTerm[w] * idfTerm[w];
    }
    return tfidf;
  });
}

export const similarity = {
  cosine(a: Vector, b: Vector): number {
    const dt = dot(a, b);
    const n1 = norm(a, 2);
    const n2 = norm(b, 2);
    return dt / (n1 * n2);
  },
};

export const distance = {
  cosine(a: Vector, b: Vector): number {
    return 1 - similarity.cosine(a, b);
  },
};

if (import.meta.main) {
  assertEquals(sum([1, -1, 0, 3, 5, 7]), 15);
  assertEquals(dot([1, -1], [2, -4]), 6);
}
