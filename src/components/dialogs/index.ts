import { mount, unmount } from 'svelte';
import SavePresetDialog from './SavePresetDialog.svelte';
import DeletePresetDialog from './DeletePresetDialog.svelte';
import PresetConfirmDialog from './PresetConfirmDialog.svelte';
import HelpDialog from './HelpDialog.svelte';

export type PresetConfirmResult = { name: string } | 'discard' | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function showDialog<T>(Component: any, props: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance: any = mount(Component, {
      target: document.body,
      props: {
        ...props,
        onclose(result: T) {
          resolve(result);
          setTimeout(() => unmount(instance), 0);
        },
      },
    });
  });
}

export function openSavePresetDialog(): Promise<string | null> {
  return showDialog<string | null>(SavePresetDialog);
}

export function openDeletePresetDialog(name: string): Promise<true | null> {
  return showDialog<true | null>(DeletePresetDialog, { name });
}

export function openPresetConfirmModal(): Promise<PresetConfirmResult> {
  return showDialog<PresetConfirmResult>(PresetConfirmDialog);
}

export function openHelpDialog(tab = ''): void {
  showDialog(HelpDialog, { tab });
}
