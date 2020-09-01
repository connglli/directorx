import DxSelector from '../selector.ts';
import DxView, { Views } from '../../ui/dxview.ts';
import { ViewMap, SelectOptions, DevInfo, DroidInput } from '../../dxdroid.ts';
import { BoWModel, similarity, closest } from '../../utils/vecutil.ts';
import { splitAsWords } from '../../utils/strutil.ts';
import { NotImplementedError } from '../../utils/error.ts';

type N<T> = T | null;

export function asViewMap(v: DxView, d: DevInfo): ViewMap {
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

/** Adaptively select the target view */
async function adaptSel(
  input: DroidInput,
  view: DxView,
  compressed = true
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

  let opt: SelectOptions;
  let vms: ViewMap[];
  opt = {
    compressed: compressed,
  };
  // let's try the most comprehensive selection, i.e., use both text
  // and another property to select our target view
  opt.textContains = view.text.length > 0 ? view.text : undefined;
  opt.resIdContains = view.resId.length > 0 ? view.resEntry : undefined;
  opt.descContains = view.desc.length > 0 ? view.desc : undefined;
  // if there is only text, then use the less comprehensive selection
  if (opt.textContains && (opt.resIdContains || opt.descContains)) {
    vms = await input.select(opt);
    // choose the best match: text is complete same
    if (vms.length >= 1) {
      let found =
        (vms.find((vm) => vm.text == view.text) ||
          vms.find((vm) => vm.text.toLowerCase() == view.text.toLowerCase())) ??
        null;
      if (found) {
        return found;
      }
    }
  }
  // clear the opt
  opt.textContains = undefined;
  opt.resIdContains = undefined;
  opt.descContains = undefined;
  // let's try some less comprehensive selection: we always treat the
  // visual information (the text) as the most important because the
  // text is shown to users. we also think that, if a view is shown
  // to users using its text on one device, it must shown to users on
  // others using similar text, and thereby, if there are text in a view,
  // then we use the text to find the view, and if no views found, we
  // never try other props like res-id and content description
  if (view.text.length != 0) {
    opt.textContains = view.text;
    vms = await input.select(opt);
    // always choose the best match, because if a view has
    // some text that presents to a user, it is probably
    // not changed across devices
    // TODO: what if there are multiple? (add context info)
    // FIX: sometimes, yota returns the capitalized text (because
    // of text view settings)
    vms = vms.filter((vm) => vm.text == view.text);
    if (vms.length == 0) {
      vms = vms.filter(
        (vm) => vm.text.toLowerCase() == view.text.toLowerCase()
      );
    }
    if (vms.length == 0) {
      return null;
    } else if (vms.length == 1) {
      return vms[0];
    } else {
      // choose the most BoW similar
      const model = new BoWModel(
        [view, ...vms].map((w) =>
          [w.text, w instanceof DxView ? w.resEntry : w['resource-entry']].join(
            ' '
          )
        ),
        true,
        1,
        ''
      );
      const vecs = model.vectors;
      const ind = closest(
        vecs[0].vector,
        vecs.slice(1).map((v) => v.vector),
        similarity.cosine
      );
      return vms[ind];
    }
  }
  // no text, let's try resource-id and content-desc.
  // like text, let's firstly try a strict content-desc selection
  if (view.desc.length != 0) {
    opt.descContains = view.desc;
    vms = await input.select(opt);
    let found =
      (vms.find((vm) => vm['content-desc'] == view.desc) ||
        vms.find(
          (vm) => vm['content-desc'].toLowerCase() == view.text.toLowerCase()
        )) ??
      null;
    if (found) {
      return found;
    }
  }
  // let's resort to non-strict resource-id and content-desc selection
  opt.textContains = undefined;
  opt.descContains = undefined;
  opt.resIdContains = undefined;
  if (view.resId.length != 0) {
    opt.resIdContains = view.resEntry;
    vms = await input.select(opt);
    if (vms.length == 1) {
      return vms[0];
    } else if (vms.length > 1) {
      // prefer same entries
      const sameEntries = vms.filter(
        (vm) => vm['resource-entry'] == view.resEntry
      );
      if (sameEntries.length == 1) {
        return sameEntries[0];
      }
      // no same entries, or multiple same entries
      vms = sameEntries.length == 0 ? vms : sameEntries;
      if (view.desc.length == 0) {
        // the view has no desc, choose the first one
        return vms[0];
      }
      // for the rest, we prefer having the same desc
      let best = vms.find((vm) => vm['content-desc'] == view.desc);
      if (best) {
        return best;
      }
      // no best, we prefer containing desc
      best = vms.find((vm) => vm['content-desc'].includes(view.desc));
      if (best) {
        return best;
      }
      // or having the most BoW similar desc
      const model = new BoWModel(
        [view, ...vms].map((w) =>
          w instanceof DxView ? w.desc : w['content-desc']
        ),
        true,
        1,
        ''
      );
      const vecs = model.vectors;
      const ind = closest(
        vecs[0].vector,
        vecs.slice(1).map((v) => v.vector),
        similarity.cosine
      );
      return vms[ind];
    }
  }
  // no text, and does not find any by resource-id, let's try content-desc
  // clear opt firstly
  opt.textContains = undefined;
  opt.resIdContains = undefined;
  opt.descContains = undefined;
  if (view.desc.length != 0) {
    opt.descContains = view.desc;
    vms = await input.select(opt);
    if (vms.length == 0) {
      return null;
    }
    // prefer having similar desc (i.e., the least length),
    // no doubt that same desc must have the least length
    // TODO: what if there are multiple? (add context info)
    const words = splitAsWords(view.desc);
    // if the desc has only one word, it is probable that
    // the view is an image-view button, and let's restrict
    // that the target view must contain this word instead
    // of contain its letters, e.g., both "Newsletter" and
    // "New Document" contain "New", but "Newsletter" is
    // apparently invalid compared to "New Document"
    if (words.length == 1) {
      vms = vms.filter(
        (vm) => splitAsWords(vm['content-desc']).indexOf(words[0]) != -1
      );
    } else {
      vms.sort((a, b) => a['content-desc'].length - b['content-desc'].length);
    }
    return vms[0] ?? null;
  }

  return null;
}

export default class AdaptiveSelector implements DxSelector {
  async select(
    input: DroidInput,
    view: DxView,
    compressed: boolean
  ): Promise<N<ViewMap>> {
    return await adaptSel(input, view, compressed);
  }
}
