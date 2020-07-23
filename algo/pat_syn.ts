import DxView, { DxTabHost, DxViewPager, DxActivity, Views } from '../dxview.ts';
import { DxSegment } from './ui_seg.ts';
import DxEvent, { DxTapEvent } from '../dxevent.ts';
import { NotImplementedError, IllegalStateError } from '../utils/error.ts';

type N<T> = T | null;

export type PatRegArgs = {
  // view on recordee
  v: DxView,
  // the recordee
  r: {
    s: DxSegment,
    a: DxActivity
  },
  // the playee
  p: {
    s: DxSegment,
    a: DxActivity
  }
}

export abstract class DxPat {
  abstract name(): string;
  abstract match(args: PatRegArgs): boolean;
  abstract apply(args: PatRegArgs): DxEvent;
}

class Expand extends DxPat {
  name() { return 'expand'; }

  match(args: PatRegArgs): boolean {
    return (
      !!args.v.findVScrollableParent() || 
      !!args.v.findHScrollableParent()
    );
  }

  apply(): DxEvent {
    throw new NotImplementedError();
  }
}

abstract class Reveal extends DxPat {
  name() { return 'reveal'; }
}

class MoreOptions extends Reveal {
  static DESC = 'More options';
  // the MoreOptions button
  private vMoreOptions: DxView | null = null;

  match(args: PatRegArgs): boolean {
    // check if there are MoreOptions button
    // buttons in the playee segment
    for (const r of args.p.s.roots) {
      const mo = r.findViewByDesc(MoreOptions.DESC)
      if (mo != null) {
        this.vMoreOptions = mo;
        return true;
      }
    }
    return false;
  }

  apply(args: PatRegArgs): DxEvent {
    if (this.vMoreOptions == null) {
      throw new IllegalStateError('Pattern is not satisfied, don\'t apply');
    }
    // synthesize a tap event on the
    // more options button
    return new DxTapEvent(
      args.p.a,
      this.vMoreOptions.drawingX + 1,
      this.vMoreOptions.drawingY + 1,
      -1
    );
  }
}

class TabHost extends Reveal {
  // the path from the view to the TabHost
  private vPath: DxView[] = [];

  match(args: PatRegArgs): boolean {
    // check whether v is in a TabHost
    this.vPath.unshift(args.v);
    let p = args.v.parent;
    while (p) {
      this.vPath.unshift(p);
      if (p instanceof DxTabHost) {
        return true;
      }
      p = p.parent;
    }
    // clear the path
    this.vPath.splice(0, this.vPath.length);
    return false;
  }

  apply(args: PatRegArgs): DxEvent {
    // TODO v is not strictly a Tab name, then how to
    // resolve the tab name where v resides? Maybe we
    // can do something when recording?
    const pSeg = args.p.s;
    // find all tabs in recordee
    if (this.vPath.length == 0) {
      throw new IllegalStateError('Pattern is not satisfied, don\'t apply');
    }
    // find the tab's direct parent, 'cause
    // sometimes the TabHost does not directly
    // host the tabs, but its children
    while (this.vPath.length > 0 && this.goodChildren(this.vPath[0]).length == 1) {
      this.vPath.shift();
    }
    const parent = this.vPath.shift();
    if (!parent) {
      throw new IllegalStateError('Pattern apply failed, cannot find the direct parent of the tab');
    }
    // now vPath[0] is the direct parent of all tabs;
    // extract their indices first, and change the 
    // indices to make the path points to next tab
    const indices = this.vPath.map(v => Views.indexOf(v));
    const currTab = indices[0];
    const sibTabs: DxView[] = [];
    for (let i = 0; i < parent.children.length; i++) {
      if (i == currTab) {
        continue;
      }
      const tab = parent.findViewByIndices([
        i, ...indices.slice(1)
      ]);
      if (tab) {
        sibTabs.push(tab);
      }
    }
    // find the available tabs in the playee segment
    // firstly try the text
    for (const v of sibTabs) {
      if (v.text.length > 0) {
        for (const r of pSeg.roots) {
          const found = r.findViewByText(v.text);
          if (found) {
            return new DxTapEvent(
              args.p.a,
              found.drawingX + 1,
              found.drawingY + 1,
              -1
            );
          }
        }
      }
    }
    // if no text are available, then try the desc
    for (const v of sibTabs) {
      if (v.desc.length > 0) {
        for (const r of pSeg.roots) {
          const found = r.findViewByDesc(v.desc);
          if (found) {
            return new DxTapEvent(
              args.p.a,
              found.drawingX + 1,
              found.drawingY + 1,
              -1
            );
          }
        }
      }
    }
    throw new NotImplementedError('TabHost');
  }

  private goodChildren(v: DxView): DxView[] {
    return v.children.filter(c => Views.isValid(c) && Views.isViewHierarchyAccImportant(c));
  }
}

class ViewPager extends Reveal {
  match(args: PatRegArgs): boolean {
    const p = args.v.parent;
    while (p) {
      if (p instanceof DxViewPager) {
        return true;
      }
    }
    return false;
  }

  apply(): DxEvent {
    throw new NotImplementedError();
  }
}

// The Pattern is sorted bottom-up, in order of
// [None, Reflow, Expand, Merge, Reveal, Transform]
const patterns = [
  // Expand
  new Expand(),
  // Reveal
  new MoreOptions(),
  new TabHost(),
  new ViewPager()
];

/** Recognize the pattern bottom-up from None to 
 * Transform. This is an assume and check process, i.e.,
 * assume a pattern, and test the pattern condition.
 * Confirm the pattern and return if and only if the 
 * condition passes, or test next pattern
 */
export default function regPat(args: PatRegArgs): N<DxPat> {
  for (const pat of patterns) {
    if (pat.match(args)) {
      return pat;
    }
  }
  return null;
}