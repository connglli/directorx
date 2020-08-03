import { WindowOwner } from './dxwin.ts';
import { IllegalStateError, NotImplementedError } from '../utils/error.ts';

type N<T> = T | null;

export interface FragmentOwner {
  readonly fragmentManager: FragmentManager;
}

export interface FragmentProps {
  class: string; // class name of the fragment
  hash: string; // hash of the fragment
  containerId?: N<string>; // the identifier of the parent container it is being added to
  fragmentId?: N<string>; // the identifier of the fragment and its view, if it is being added to a container
  hidden?: boolean; // hidden or not
  detached?: boolean; // detached or not
}

/** A DxFragment is part of a view hierarchy, contained by its container. And
 * also, a fragment can have multiple child fragments managed by its fragment
 * manager. A fragment is maybe active or not. */
export class DxFragment implements FragmentOwner {
  protected props_: Required<FragmentProps>;
  constructor(props: FragmentProps, public active = false) {
    this.props_ = {
      class: props.class,
      hash: props.hash,
      containerId: props.containerId ?? null,
      fragmentId: props.fragmentId ?? null,
      hidden: props.hidden ?? false,
      detached: props.detached ?? false,
    };
  }

  get fragmentManager(): FragmentManager {
    throw new NotImplementedError('Child fragment');
  }

  get props(): FragmentProps {
    return {
      ...this.props_,
    };
  }

  get viewId(): N<string> {
    return this.fragmentId;
  }

  get fragmentId(): N<string> {
    return this.props_.fragmentId;
  }

  get containerId(): N<string> {
    return this.props_.containerId;
  }

  get hash() {
    return this.props_.hash;
  }

  get cls() {
    return this.props_.class;
  }

  get hidden() {
    return this.props.hidden;
  }

  get detached() {
    return this.props.detached;
  }

  copy(): DxFragment {
    return new DxFragment(
      {
        ...this.props_,
      },
      this.active
    );
  }

  equals(f: DxFragment) {
    return (
      this.active == f.active &&
      this.hidden == f.hidden &&
      this.detached == f.detached &&
      this.hash == f.hash &&
      this.cls == f.cls &&
      this.fragmentId == f.fragmentId &&
      this.containerId == f.containerId
    );
  }
}

/** A FragmentManager manages all its child fragments */
export class FragmentManager {
  // all added fragments, including active and inactive
  private readonly added_: DxFragment[] = [];
  // owner of the manager
  constructor(public readonly owner: FragmentOwner) {}

  get active() {
    return this.findFragments((f) => f.active);
  }

  get added() {
    return this.added_.slice();
  }

  /** Add a new fragment */
  addFragment(props: FragmentProps) {
    let found = this.findFragment(
      (f) => f.cls == props.class && f.hash == props.hash
    );
    if (found) {
      throw new IllegalStateError(
        'Fragment with same class and hash already exists'
      );
    }
    this.added_.push(new DxFragment(props, false));
    return this.added_[this.added_.length - 1];
  }

  /** Activate an existing fragment, or else add it first */
  activateFragment(props: FragmentProps) {
    let found = this.added_.findIndex(
      (f) => f.cls == props.class && f.hash == props.hash
    );
    if (found == -1) {
      found = this.added_.length;
      this.addFragment(props);
    } else {
      this.added_.splice(found, 1, new DxFragment(props));
    }
    this.added_[found].active = true;
    return found;
  }

  /** Find the first fragment that satisfy the predicate */
  findFragment(pred: (f: DxFragment) => boolean) {
    return this.added_.find(pred) ?? null;
  }

  /** Find all fragments that satisfy the predicate */
  findFragments(pred: (f: DxFragment) => boolean) {
    return this.added_.filter(pred);
  }
}

/** A DxActivity is an owner of a window, which manages a view hierarchy,
 * can have multiple fragments, which are managed by its fragment manager */
export default class DxActivity extends WindowOwner implements FragmentOwner {
  public readonly fragmentManager: FragmentManager = new FragmentManager(this);
  public constructor(app: string, public readonly name: string) {
    super(app);
  }
}
