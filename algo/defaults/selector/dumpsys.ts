import DxSelector from '../../selector.ts';
import { DxUiNormalizer } from '../../normalizer.ts';
import DxView, { Views, ViewFinder } from '../../../ui/dxview.ts';
import DxDroid, { ViewMap, DevInfo } from '../../../dxdroid.ts';
import { BoWModel, similarity, closest } from '../../../utils/vecutil.ts';
import { NotImplementedError } from '../../../utils/error.ts';
import DxCompatUi from '../../../ui/dxui.ts';
import { splitAsWords } from '../../../utils/strutil.ts';

type N<T> = T | null;

function asViewMap(v: N<DxView>, d: DevInfo): N<ViewMap> {
  if (!v) {
    return null;
  }
  const [resPkg, resType, resEntry] = Views.splitResourceId(v.resId);
  return {
    index: v.parent?.children.indexOf(v) ?? -1,
    package: v.pkg,
    class: v.cls,
    'resource-id': v.resId,
    'resource-pkg': resPkg,
    'resource-type': resType,
    'resource-entry': resEntry,
    visible: Views.isVisibleToUser(v, d),
    text: v.text,
    'content-desc': v.desc,
    clickable: v.flags.c,
    'context-clickable': v.flags.cc,
    'long-clickable': v.flags.lc,
    scrollable: v.flags.s.b || v.flags.s.t || v.flags.s.l || v.flags.s.r,
    checkable: false, // TODO: add checkable
    checked: false, // TODO: add checked
    focusable: v.flags.f,
    focused: v.flags.F,
    selected: v.flags.S,
    password: false, // TODO: add password
    enabled: v.flags.E,
    important: v.flags.a,
    background: v.bgColor ?? undefined,
    bounds: {
      // the visible and drawing bounds
      left: Views.x0(v),
      right: Views.x1(v),
      top: Views.y0(v),
      bottom: Views.y1(v),
    },
  };
}

function findViewsByText(
  ui: DxCompatUi,
  text: string,
  dev: DevInfo,
  visibleOnly: boolean
) {
  return ViewFinder.findViews(
    ui.decorView!,
    (v) => (!visibleOnly || Views.isVisibleToUser(v, dev)) && v.text == text
  );
}

function findViewsIncludesDesc(
  ui: DxCompatUi,
  desc: string,
  dev: DevInfo,
  visibleOnly: boolean
) {
  return ViewFinder.findViews(
    ui.decorView!,
    (v) =>
      (!visibleOnly || Views.isVisibleToUser(v, dev)) && v.desc.includes(desc)
  );
}

function findViewsIncludesDescWord(
  ui: DxCompatUi,
  desc: string,
  dev: DevInfo,
  visibleOnly: boolean
) {
  return ViewFinder.findViews(
    ui.decorView!,
    (v) =>
      (!visibleOnly || Views.isVisibleToUser(v, dev)) &&
      v.desc.includes(desc) &&
      splitAsWords(v.desc).includes(v.desc)
  );
}

function findViewsIncludesResEntry(
  ui: DxCompatUi,
  entry: string,
  dev: DevInfo,
  visibleOnly: boolean
) {
  return ViewFinder.findViews(
    ui.decorView!,
    (v) =>
      (!visibleOnly || Views.isVisibleToUser(v, dev)) &&
      v.resEntry.includes(entry)
  );
}

async function adaptSel(
  view: DxView,
  ui: DxCompatUi,
  dev: DevInfo,
  visibleOnly = true
): Promise<N<ViewMap>> {
  if (
    view.text.length == 0 &&
    view.resId.length == 0 &&
    view.desc.length == 0
  ) {
    throw new NotImplementedError(
      'text, resource-id and content-desc are all empty'
    );
  }

  let array: DxView[] = [];
  let docFn: (v: DxView) => string = () => '';

  if (view.text.length > 0) {
    array = findViewsByText(ui, view.text, dev, visibleOnly);
    docFn = (v) => v.resEntry + ' ' + v.desc;
  } else {
    if (view.resEntry.length > 0) {
      array = findViewsIncludesResEntry(ui, view.resEntry, dev, visibleOnly);
      docFn = (v) => v.resEntry + ' ' + v.desc;
    }

    if (array.length == 0 && view.desc.length > 0) {
      if (splitAsWords(view.desc).length == 1) {
        array = findViewsIncludesDescWord(ui, view.desc, dev, visibleOnly);
      } else {
        array = findViewsIncludesDesc(ui, view.desc, dev, visibleOnly);
      }
      docFn = (v) => v.desc;
    }
  }

  if (array.length <= 0) {
    return null;
  } else if (array.length == 1) {
    return asViewMap(array[0], dev);
  }

  const vectors = new BoWModel(
    [view, ...array].map(docFn),
    true,
    1,
    ''
  ).vectors.map((v) => v.vector);
  const index = closest(vectors[0], vectors.slice(1), similarity.cosine);

  return asViewMap(array[index], dev);
}

export default class AdaptiveDumpsysSelector extends DxSelector {
  constructor(
    public readonly app: string,
    public readonly droid: DxDroid,
    public readonly uiNorm: DxUiNormalizer
  ) {
    super();
  }

  async doSelect(view: DxView, visibleOnly: boolean) {
    return adaptSel(view, await this.topUi(), this.droid.dev, visibleOnly);
  }

  async topUi() {
    return this.uiNorm.normalize(
      await this.droid.topUi(this.app, 'dumpsys'),
      this.droid.dev
    );
  }
}
