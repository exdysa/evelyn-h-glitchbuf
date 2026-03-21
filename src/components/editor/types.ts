import type { OpDef } from '../../ops';

export type EffectModalOpts =
  | {
      kind: 'edit';
      meta: OpDef;
      currentText: string;
      onApply: (result: string) => void;
      onLivePreview?: (result: string) => void;
    }
  | { kind: 'add'; onApply: (result: string) => void }
  | { kind: 'wrap'; original: string; onApply: (result: string) => void };

export interface EffectModalApi {
  open: (opts: EffectModalOpts) => void;
}
