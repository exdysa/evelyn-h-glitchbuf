<script lang="ts">
  import { getAppContext } from "../context";
  import {
    BUILT_IN_PRESETS,
    loadUserPresets,
    saveUserPresets,
    type Preset,
  } from "../presets";
  import {
    openSavePresetDialog,
    openDeletePresetDialog,
    openPresetConfirmModal,
  } from "./dialogs";
  import type { PresetConfirmResult } from "./dialogs";
  import Field from "./base/Field.svelte";
  import Button from "./base/Button.svelte";

  const ctx = getAppContext();

  let userPresets: Preset[] = $state(loadUserPresets());
  let selectedValue = $state("");
  let currentSelectValue = "";
  // Track the script as it was when last loaded from a preset (or on init).
  // If the user edits the script since then, we prompt before loading another.
  let lastLoadedCode = ctx.state.script;

  function saveCurrentAsPreset(name: string, selectAfter?: string): void {
    const idx = userPresets.findIndex((p) => p.name === name);
    const updated: Preset = { name, code: ctx.state.script };
    userPresets =
      idx >= 0
        ? [...userPresets.slice(0, idx), updated, ...userPresets.slice(idx + 1)]
        : [...userPresets, updated];
    saveUserPresets(userPresets);
    if (selectAfter !== undefined) {
      selectedValue = selectAfter;
      currentSelectValue = selectAfter;
    }
  }

  async function onSelectChange(): Promise<void> {
    const val = selectedValue;
    if (!val) {
      currentSelectValue = "";
      return;
    }

    if (ctx.state.script !== lastLoadedCode) {
      const result: PresetConfirmResult = await openPresetConfirmModal();
      if (result === null) {
        selectedValue = currentSelectValue;
        return;
      }
      if (typeof result === "object" && result.name)
        saveCurrentAsPreset(result.name, val);
    }

    let code: string | undefined;
    if (val.startsWith("builtin:")) {
      code = BUILT_IN_PRESETS.find((p) => "builtin:" + p.name === val)?.code;
    } else if (val.startsWith("user:")) {
      code = userPresets.find((p) => "user:" + p.name === val)?.code;
    }
    if (code !== undefined) {
      history.pushState(null, "", location.href);
      ctx.setScript(code);
      lastLoadedCode = ctx.state.script;
      currentSelectValue = val;
    }
  }

  async function onSave(): Promise<void> {
    const name = await openSavePresetDialog();
    if (!name) return;
    saveCurrentAsPreset(name, "user:" + name);
    lastLoadedCode = ctx.state.script;
  }

  async function onDelete(): Promise<void> {
    if (!selectedValue.startsWith("user:")) return;
    const name = selectedValue.slice("user:".length);
    if (!(await openDeletePresetDialog(name))) return;
    userPresets = userPresets.filter((p) => p.name !== name);
    saveUserPresets(userPresets);
    selectedValue = "";
    currentSelectValue = "";
  }
</script>

<div class="presets-row">
  <Field label="presets" for="presets">
    <select id="presets" bind:value={selectedValue} onchange={onSelectChange}>
      <option value="">— select preset —</option>
      <optgroup label="built-in">
        {#each BUILT_IN_PRESETS as p}
          <option value="builtin:{p.name}">{p.name}</option>
        {/each}
      </optgroup>
      {#if userPresets.length > 0}
        <optgroup label="saved">
          {#each userPresets as p}
            <option value="user:{p.name}">{p.name}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
  </Field>
  <Button onclick={onSave}>save</Button>
  <Button disabled={!selectedValue.startsWith("user:")} onclick={onDelete}>delete</Button>
</div>

<style>
  .presets-row {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }

  .presets-row :global(.field) {
    flex: 1;
    min-width: 0;
  }
</style>
