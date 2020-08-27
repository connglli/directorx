export * from './ada_sel.ts';
export * from './ui_seg.ts';
export * from './seg_mat.ts';
export * from './patterns.ts';
export * from './pat_syn.ts';

import adaptSel from './ada_sel.ts';
import segUi from './ui_seg.ts';
import matchSeg from './seg_mat.ts';
import synPat from './pat_syn.ts';

export {
  adaptSel as adaptiveSelect,
  segUi as segmentUi,
  matchSeg as matchSegment,
  synPat as synthesizePattern,
};
