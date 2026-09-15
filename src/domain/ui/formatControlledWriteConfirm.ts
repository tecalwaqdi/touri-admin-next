/**
 * PC-9 — format localized controlled-write confirmation templates.
 * Templates use {action}, {id}, {state} placeholders only (no PII).
 */

export function formatControlledWriteConfirm(
  template: string,
  vars: { action: string; id: string; state: string },
): string {
  return template
    .replaceAll("{action}", vars.action)
    .replaceAll("{id}", vars.id)
    .replaceAll("{state}", vars.state);
}
