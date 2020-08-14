import { assertEquals } from 'https://deno.land/std@0.60.0/testing/asserts.ts';
import { splitAsWords, filterStopwords } from './strutil.ts';

export class VecutilError extends Error {}

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

export function closest(
  a: Vector,
  x: Vector[],
  simFn: (a: Vector, b: Vector) => number
): number {
  let max = Number.NEGATIVE_INFINITY;
  let maxInd = -1;
  for (let i = 0; i < x.length; i++) {
    const s = simFn(a, x[i]);
    if (s > max) {
      max = s;
      maxInd = i;
    }
  }
  return maxInd;
}

export type WordFreq = {
  [word: string]: number;
};

export type WordVec = {
  words: string[];
  vector: Vector;
};

export function doc2freq(words: string[]): WordFreq {
  const freq: WordFreq = {};
  for (const w of words) {
    freq[w] = freq[w] === undefined ? 1 : freq[w] + 1;
  }
  return freq;
}

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

export function nGramFeature(
  doc: string[],
  n: number,
  padStart = '<BOD>',
  padEnd = '<EOD>'
): string[][] {
  return nGramFeatureGeneric(doc, n, padStart, padEnd);
}

export function nGramFeatureGeneric<T>(
  doc: T[],
  n: number,
  padStart: T,
  padEnd: T
): T[][] {
  if (n <= 0) {
    throw new VecutilError('N cannot be non-positive');
  } else if (n >= 1) {
    doc = doc.slice();
    doc.unshift(...new Array<T>(n - 1).fill(padStart));
    doc.push(...new Array<T>(n - 1).fill(padEnd));
  }
  const features = [];
  for (let i = 0; i <= doc.length - n; i++) {
    features.push(doc.slice(i, i + n));
  }
  return features;
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

export abstract class DocumentModel {
  public readonly rawCorpus: string[];
  public readonly rmStopwords: boolean;
  public readonly nGram: number;
  public readonly sep: string;

  protected corpus_: string[][];
  protected frequencies_: WordFreq[];
  protected words_: string[];
  protected vectors_: WordVec[];

  constructor(corpus: string[], rmStopwords = true, nGram = 1, sep = '/') {
    this.rawCorpus = corpus;
    this.rmStopwords = rmStopwords;
    this.nGram = nGram;
    this.sep = sep;
    this.corpus_ = corpus.map((d) =>
      splitAsWords(d).map((i) => i.toLowerCase())
    );
    if (this.rmStopwords) {
      this.corpus_ = this.corpus_.map((d) => filterStopwords(d));
    }
    this.corpus_ = this.corpus_.map((d) =>
      nGramFeature(d, this.nGram).map((i) => i.join(this.sep))
    );
    this.frequencies_ = this.corpus_.map(doc2freq);
    this.words_ = Array.from(new Set(this.frequencies_.flatMap(Object.keys)));
    this.vectors_ = this.trainModel();
  }

  /** Returns the word frequency for each document */
  get frequencies() {
    return this.frequencies_;
  }

  /** Return all words that appears in this corpus */
  get words() {
    return this.words_;
  }

  /** Returns the document vector for each document */
  get vectors() {
    return this.vectors_;
  }

  /** Train the model, i.e., convert the frequency to  document vector */
  protected abstract trainModel(): WordVec[];
}

/** The Bag of Words document model */
export class BoWModel extends DocumentModel {
  protected trainModel() {
    // directly map frequencies to vectors
    return this.frequencies_.map((f) => freq2vec(f, this.words_));
  }
}

/** The Term-Frequency Inverse-Document-Frequency document model */
export class TfIdfModel extends DocumentModel {
  protected trainModel() {
    // convert to tfidf freq, then map to vector
    const tfidfRepr = tfidf(this.frequencies_);
    return tfidfRepr.map((f) => freq2vec(f, this.words_));
  }
}

if (import.meta.main) {
  assertEquals(sum([1, -1, 0, 3, 5, 7]), 15);
  assertEquals(dot([1, -1], [2, -4]), 6);
}
