/** Prefix every branch of a comma-separated selector list. */
export const scoped = (prefix: string, list: string) =>
  list
    .split(",")
    .map((s) => `${prefix}${s.trim()}`)
    .join(", ");

export const CONTROL_SELECTOR =
  'select, [role="combobox"], mat-select, ng-select, .dropdown-toggle, .ng-select';

export const OPTION_SELECTOR =
  '[role="option"], mat-option, .ng-option, .dropdown-item, .k-list-item, .k-item, li, option';

export const PANEL_SELECTOR = [
  ".cdk-overlay-container",
  '[role="listbox"]',
  ".dropdown-menu",
  ".ng-dropdown-panel",
  ".select2-results",
  ".p-dropdown-panel",
  ".ui-autocomplete",
  ".autocomplete-panel",
  ".k-animation-container",
  ".k-popup",
  ".k-list-container",
].join(", ");

export const normalizeOptionText = (s: string) =>
  s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/**
 * Index of the option whose whole label equals `label`.
 * Returns -1 rather than falling back to a substring hit, so "Name" can never
 * resolve to "GoalName" just because it happens to be listed first.
 */
export function chooseExactIndex(texts: string[], label: string): number {
  const want = normalizeOptionText(label).toLowerCase();
  return texts.findIndex((t) => normalizeOptionText(t).toLowerCase() === want);
}
