import { DxUiNormalizer } from '../../normalizer.ts';
import DxCompatUi from '../../../ui/dxui.ts';

export default class IdentityUi extends DxUiNormalizer {
  apply(ui: DxCompatUi) {
    return Promise.resolve(ui);
  }
}
