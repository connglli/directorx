import DxView from '../ui/dxview.ts';
import DxSegment from '../ui/dxseg.ts';
import { BiGraph } from '../utils/bigraph.ts';
import * as vecutil from '../utils/vecutil.ts';
import { filterStopwords, splitAsWords } from '../utils/strutil.ts';
import { enumerate } from '../utils/pyalike.ts';

type WordFreq = vecutil.WordFreq;
type WordVec = vecutil.WordVec;

const DEFAULTS = {
  GRAM: 1, // N-GRAM features the matching algorithm used, default is 1-gram
};

/** If a segment is matched to nobody, then it is matched to NO_MATCH */
export const NO_MATCH: DxSegment = new DxSegment([], -1, -1, -1, -1, -1);

/** Two matched segments and their match score */
export type MatchItem = [DxSegment, DxSegment, number];

/** DxSegmentMatch is the match result of two segments, one can
 * fetch the global best match of a segment by #getMatch() */
export class DxSegMatch {
  constructor(
    private left: DxSegment[],
    private right: DxSegment[],
    private score: number[][],
    // indices of matched segments
    private match: [number, number][]
  ) {}

  /** Get the perfect matched segment, i.e., the most satisfying
   * matched segment (not strictly the best match whose score is
   * the best) */
  getPerfectMatch(s: DxSegment): DxSegment | null {
    for (const [a, b] of this.match) {
      if (this.left[a] == s) {
        return this.right[b];
      } else if (this.right[b] == s) {
        return this.left[a];
      }
    }
    return null;
  }

  /** Get the matches whose score is the best, returning
   * the score, and the matched segments */
  getBestMatches(s: DxSegment): [number, DxSegment[]] {
    let ind = this.left.indexOf(s);
    if (ind == -1) {
      ind = this.right.indexOf(s);
      if (ind == -1) {
        return [Number.NEGATIVE_INFINITY, []];
      } else {
        return this.doGetBestMatch(ind, false);
      }
    } else {
      return this.doGetBestMatch(ind, true);
    }
  }

  /** Iterates over the most satisfying matches */
  *[Symbol.iterator](): IterableIterator<MatchItem> {
    yield* this.match.map(
      ([a, b]) => [this.left[a], this.right[b], this.score[a][b]] as MatchItem
    );
  }

  private doGetBestMatch(
    ind: number,
    indIsLeft: boolean
  ): [number, DxSegment[]] {
    let sco: number[];
    if (indIsLeft) {
      sco = this.score[ind];
    } else {
      sco = this.score.map((i) => i[ind]);
    }
    let maxInd: number[] = [];
    let maxSco = Number.NEGATIVE_INFINITY;
    for (const [i, w] of enumerate(sco)) {
      if (w > maxSco) {
        maxInd = [i];
        maxSco = w;
      } else if (w == maxSco) {
        maxInd.push(i);
      }
    }
    return [
      maxSco,
      maxInd.map((i) => (indIsLeft ? this.right[i] : this.left[i])),
    ];
  }
}

/** Extract the n gram feature of a str */
function extractNGramFeaturesOf(str: string, n: number): string[][] {
  return vecutil.nGramFeature(
    filterStopwords(splitAsWords(str).map((w) => w.toLowerCase())),
    n
  );
}

/** Collect the words and create a WordFreq from a segment */
function newWordFreq(seg: DxSegment): WordFreq {
  const freq: WordFreq = {};
  function collect(view: DxView) {
    const ws = [
      ...extractNGramFeaturesOf(view.resEntry, DEFAULTS.GRAM),
      ...extractNGramFeaturesOf(view.desc, DEFAULTS.GRAM),
      ...extractNGramFeaturesOf(view.text, DEFAULTS.GRAM),
      ...extractNGramFeaturesOf(view.tag, DEFAULTS.GRAM),
      ...extractNGramFeaturesOf(view.tip, DEFAULTS.GRAM),
      ...extractNGramFeaturesOf(view.hint, DEFAULTS.GRAM),
    ].map((i) => i.join('')); // join n-gram feature as a single word
    for (const w of ws) {
      freq[w] = 1 + (freq[w] ?? 0);
    }
    for (const c of view.children) {
      collect(c);
    }
  }
  for (const r of seg.roots) {
    collect(r);
  }
  return freq;
}

/** Calculator similarity of two word vectors (cosine similarity) */
function similarity(v1: WordVec, v2: WordVec): number {
  return Math.round(1000 * vecutil.similarity.cosine(v1.vector, v2.vector));
}

/** Match segments in a and b, and return a match result */
export default function matchSeg(a: DxSegment[], b: DxSegment[]): DxSegMatch {
  // append NO_MATCH to make them equal-length
  const side1 = a.slice();
  const side2 = b.slice();
  const diff = side1.length - side2.length;
  if (diff > 0) {
    side2.push(...new Array<DxSegment>(diff).fill(NO_MATCH));
  } else if (diff < 0) {
    side1.push(...new Array<DxSegment>(-diff).fill(NO_MATCH));
  }
  const size = side1.length;

  // count word frequency
  const freqs1 = side1.map(newWordFreq);
  const freqs2 = side2.map(newWordFreq);
  // create the word list
  const words = Array.from(
    new Set([...freqs1, ...freqs2].flatMap(Object.keys))
  );
  // calculate the tf-idf for each word
  const tfidfs = vecutil.tfidf([...freqs1, ...freqs2]);
  const tfidfs1 = tfidfs.slice(0, freqs1.length);
  const tfidfs2 = tfidfs.slice(freqs1.length);
  // create word vector from tfidf
  const vecs1 = tfidfs1.map((tfidf) => vecutil.freq2vec(tfidf, words));
  const vecs2 = tfidfs2.map((tfidf) => vecutil.freq2vec(tfidf, words));

  // treat similarity as weights, and make the
  // similarity of NO_MATCH to any as 0
  const weights: number[][] = [];
  for (let v = 0; v < size; v++) {
    if (side1[v] == NO_MATCH) {
      weights.push(new Array<number>(size).fill(0));
    } else {
      const v1 = vecs1[v];
      weights.push(
        vecs2.map((v2, w) => (side2[w] == NO_MATCH ? 0 : similarity(v1, v2)))
      );
    }
  }

  // do bipart graph maximum weight perfect matching
  // and get the matched segments
  const graph = new BiGraph(weights);
  graph.match();

  // construct and return the matched result
  const mat: [number, number][] = side1.map(
    (_, v) => [v, graph.getMatch(v, true)] as [number, number]
  );

  return new DxSegMatch(side1, side2, weights, mat);
}
