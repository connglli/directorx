import { DxUiNormalizer } from '../../normalizer.ts';
import DxCompatUi from '../../../ui/dxui.ts';

export default class IdentityUi extends DxUiNormalizer {
  normalize(ui: DxCompatUi) {
    return Promise.resolve(ui);
  }
}
