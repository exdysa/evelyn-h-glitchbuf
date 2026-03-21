import { getContext, setContext } from 'svelte';

export interface AppState {
  seed: string;
  script: string;
}

export interface AppCtx {
  state: AppState;
  setScript(code: string): void;
  pushHistory(): void;
  loadImage(blob: Blob): Promise<void>;
  runImage(immediate?: boolean): Promise<void>;
  showError(msg: string, immediate?: boolean): void;
  download(): Promise<void>;
}

const KEY = Symbol('app');

export function setAppContext(ctx: AppCtx): void {
  setContext(KEY, ctx);
}
export function getAppContext(): AppCtx {
  return getContext(KEY);
}
