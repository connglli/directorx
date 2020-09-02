import DxSegmentMatcher, { DxSegMatch, NO_MATCH } from '../matcher.ts';
import DxView from '../../ui/dxview.ts';
import DxSegment from '../../ui/dxseg.ts';
import { BiGraph } from '../../utils/bigraph.ts';
import * as vecutil from '../../utils/vecutil.ts';

type WordVec = vecutil.WordVec;

/** Calculator similarity of two word vectors (cosine similarity) */
function similarity(v1: WordVec, v2: WordVec): number {
  return Math.round(1000 * vecutil.similarity.cosine(v1.vector, v2.vector));
}

/** Match segments in a and b, and return a match result */
function matchSeg(a: DxSegment[], b: DxSegment[]): DxSegMatch {
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

  // create an document for each segment
  const corpus = [...side1, ...side2].map((seg) => {
    let doc: string = '';
    function concat(view: DxView) {
      doc += view.resEntry + ' ';
      doc += view.desc + ' ';
      doc += view.text + ' ';
      doc += view.tag + ' ';
      doc += view.tip + ' ';
      doc += view.hint + ' ';
      for (const c of view.children) {
        concat(c);
      }
    }
    for (const r of seg.roots) {
      concat(r);
    }
    return doc;
  });
  // train a tfidf model
  const model = new vecutil.TfIdfModel(corpus, true, 1, '');
  // retrieve the tfidf vector for each segment
  const vectors = model.vectors;
  const vecs1 = vectors.slice(0, side1.length);
  const vecs2 = vectors.slice(side1.length);

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

/** A TfIdfMatcher matches the segments by their tf-idf similarity */
export default class TfIdfMatcher implements DxSegmentMatcher {
  match(a: DxSegment[], b: DxSegment[]) {
    return Promise.resolve(matchSeg(a, b));
  }
}
