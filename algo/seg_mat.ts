import { DxSegment } from './ui_seg.ts';
import DxView from '../dxview.ts';
import { BiGraph } from '../utils/bigraph.ts';
import * as vecutil from '../utils/vecutil.ts';
import { 
  filterStopwords, 
  splitAsWords
} from '../utils/strutil.ts';

type WordFreq = vecutil.WordFreq;
type WordVec = vecutil.WordVec;

export const NO_MATCH: DxSegment = {
  roots: [], x: -1, y: -1, w: -1, h: -1, level: -1, parent: null,
};

type MatchItem = [DxSegment, DxSegment, number];

export class DxSegMatch {
  constructor(
    // seg, seg, score
    private match: MatchItem[]
  ) {}
  
  getMatch(s: DxSegment): DxSegment | null {
    for (const [a, b] of this.match) {
      if (a == s) {
        return b;
      } else if (b == s) {
        return a;
      }
    }
    return null;
  }

  *[Symbol.iterator](): IterableIterator<MatchItem> {
    yield* this.match;
  }
}

/** Collect the words and create a WordFreq from a segment */
function newWordFreq(seg: DxSegment): WordFreq {
  const freq: WordFreq = {};
  function collect(view: DxView) {
    const ws = [
      ...filterStopwords(splitAsWords(view.resEntry).map(w => w.toLowerCase())),
      ...filterStopwords(splitAsWords(view.desc).map(w => w.toLowerCase())),
      ...filterStopwords(splitAsWords(view.text).map(w => w.toLowerCase())),
      ...filterStopwords(splitAsWords(view.tag).map(w => w.toLowerCase())),
      ...filterStopwords(splitAsWords(view.tip).map(w => w.toLowerCase())),
      ...filterStopwords(splitAsWords(view.hint).map(w => w.toLowerCase()))
    ];
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
  return Math.round(100 * vecutil.similarity.cosine(v1.vector, v2.vector));
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
  const words = Array.from(new Set([...freqs1, ...freqs2].flatMap(Object.keys)));
  // calculate the tf-idf for each word
  const tfidfs = vecutil.tfidf([...freqs1, ...freqs2]);
  const tfidfs1 = tfidfs.slice(0, freqs1.length);
  const tfidfs2 = tfidfs.slice(freqs1.length);
  // create word vector from tfidf
  const vecs1 = tfidfs1.map(tfidf => vecutil.freq2vec(tfidf, words));
  const vecs2 = tfidfs2.map(tfidf => vecutil.freq2vec(tfidf, words));

  // treat similarity as weights, and make the 
  // similarity of NO_MATCH to any as 0
  const weights: number[][] = [];
  for (let v = 0; v < size; v ++) {
    if (side1[v] == NO_MATCH) {
      weights.push(new Array<number>(size).fill(0));
    } else {
      const v1 = vecs1[v];
      weights.push(vecs2.map(
        (v2, w) => side2[w] == NO_MATCH ? 0 : similarity(v1, v2)
      ));
    }
  }

  // do bipart graph maximum weight perfect matching
  // and get the matched segments
  const graph = new BiGraph(weights);
  graph.match();

  // construct and return the matched result 
  const mat: MatchItem[] = [];
  for (let v = 0; v < side1.length; v ++) {
    const w = graph.getMatch(v, true);
    mat.push([side1[v], side2[w], weights[v][w]]);
  }
  
  return new DxSegMatch(mat);
}