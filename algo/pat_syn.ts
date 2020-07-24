import DxView, { DxTabHost, DxViewPager, DxActivity, Views } from '../dxview.ts';
import { DxSegment } from './ui_seg.ts';
import DxEvent, { DxTapEvent } from '../dxevent.ts';
import { DevInfo } from '../dxdroid.ts';
import { NotImplementedError, IllegalStateError } from '../utils/error.ts';

type N<T> = T | null;

/** Synthetic event returned by applying each pattern */
export class SyntEvent {
  constructor(
    public readonly e: DxEvent
  ) {}
}

export interface PatRecArgs {}

export abstract class DxPat {
  constructor(
    protected readonly args: PatRecArgs
  ) {}
  abstract match(): boolean;
  abstract apply(): SyntEvent;
}

export interface InvisiblePatRecArgs extends PatRecArgs {
  v: DxView;
  // playee activity
  a: DxActivity;
  // playee device
  d: DevInfo;
}

/** Invisible pattern is used for those invisible views */
export class Invisible extends DxPat {
  private vParent: N<DxView> = null;
  constructor(
    protected args: InvisiblePatRecArgs
  ) {
    super(args);
  }

  match(): boolean {
    const { 
      v: view, a: act, d: dev 
    } = this.args;
    let p = view.parent;
    while (p) {
      if (Views.isViewAccImportant(p) && Views.isVisibleToUser(p, dev)) {
        this.vParent = p;
        return true;
      }
      p = p.parent;
    }
    return false;
  }

  apply(): SyntEvent {
    if (this.vParent == null) {
      throw new IllegalStateError("Pattern is not satisfied, don't apply");
    }
    return new SyntEvent(new DxTapEvent(
      this.args.a,
      this.vParent.drawingX + 1,
      this.vParent.drawingY + 1,
      -1
    ));
  }
}

export interface BpPatRecArgs extends PatRecArgs {
  // view on recordee
  v: DxView;
  // the recordee
  r: {
    s: DxSegment;
    a: DxActivity;
  };
  // the playee
  p: {
    s: DxSegment;
    a: DxActivity;
  };
}

/** Bottom-up patterns that our pattern recognition 
 * algorithm used. The level denotes the level the
 * pattern resides. To implements 
 */
export abstract class DxBpPat extends DxPat {
  constructor(
    protected args: BpPatRecArgs
  ) {
    super(args);
  }

  abstract level(): string;
}

class Expand extends DxBpPat {
  level() { return 'expand'; }

  match(): boolean {
    return (
      !!this.args.v.findVScrollableParent() || 
      !!this.args.v.findHScrollableParent()
    );
  }

  apply(): SyntEvent {
    throw new NotImplementedError();
  }
}

abstract class Reveal extends DxBpPat {
  level() { return 'reveal'; }
}

class MoreOptions extends Reveal {
  static DESC = 'More options';
  // the MoreOptions button
  private vMoreOptions: N<DxView> = null;

  match(): boolean {
    // check if there are MoreOptions button
    // buttons in the playee segment
    for (const r of this.args.p.s.roots) {
      const mo = r.findViewByDesc(MoreOptions.DESC)
      if (mo != null) {
        this.vMoreOptions = mo;
        return true;
      }
    }
    return false;
  }

  apply(): SyntEvent {
    if (this.vMoreOptions == null) {
      throw new IllegalStateError('Pattern is not satisfied, don\'t apply');
    }
    // synthesize a tap event on the
    // more options button
    return new SyntEvent(
      new DxTapEvent(
        this.args.p.a,
        Views.x0(this.vMoreOptions) + 1,
        Views.y0(this.vMoreOptions) + 1,
        -1
      )
    );
  }
}

class TabHost extends Reveal {
  // the path from the view to the TabHost
  private vPath: DxView[] = [];

  match(): boolean {
    // check whether v is in a TabHost
    this.vPath.unshift(this.args.v);
    let p = this.args.v.parent;
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

  apply(): SyntEvent {
    // find all tabs in recordee
    if (this.vPath.length == 0) {
      throw new IllegalStateError('Pattern is not satisfied, don\'t apply');
    }
    // TODO v is not strictly a Tab name, then how to
    // resolve the tab name where v resides? Maybe we
    // can do something when recording?
    const pSeg = this.args.p.s;
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
            return new SyntEvent(
              new DxTapEvent(
                this.args.p.a,
                Views.x0(found) + 1,
                Views.y0(found) + 1,
                -1
              )
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
            return new SyntEvent(
              new DxTapEvent(
                this.args.p.a,
                Views.x0(found) + 1,
                Views.y0(found) + 1,
                -1
              )
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
  match(): boolean {
    const p = this.args.v.parent;
    while (p) {
      if (p instanceof DxViewPager) {
        return true;
      }
    }
    return false;
  }

  apply(): SyntEvent {
    throw new NotImplementedError();
  }
}

// The Pattern is sorted bottom-up, in order of
// [None, Reflow, Expand, Merge, Reveal, Transform]
const patterns = [
  // Expand
  Expand,
  // Reveal
  MoreOptions,
  TabHost,
  ViewPager
];

/** Recognize the pattern bottom-up from None to 
 * Transform. This is an assume and check process, i.e.,
 * assume a pattern, and test the pattern condition.
 * Confirm the pattern and return if and only if the 
 * condition passes, or test next pattern
 */
export default function regBpPat(args: BpPatRecArgs): N<DxBpPat> {
  for (const Pat of patterns) {
    const pat = new Pat(args);
    if (pat.match()) {
      return pat;
    }
  }
  return null;
}