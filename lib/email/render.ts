/**
 * Tiny template renderer: `{{client_first_name}}` → values['client_first_name'].
 * Unknown vars render as empty string. Whitespace inside braces is tolerated.
 */
export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key]
    return v === undefined || v === null ? '' : String(v)
  })
}
