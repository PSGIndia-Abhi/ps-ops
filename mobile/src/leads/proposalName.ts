/**
 * The file name a quotation PDF is shown, opened and saved under: CLIENTNAME_PROPOSAL_YEAR.pdf,
 * e.g. ABC_Foods_Pvt_Ltd_PROPOSAL_2026.pdf - the same rule as the server (crm-lead-quotations
 * proposalFileName) and the web (leadsApi proposalFileName). Kept free of other imports so the
 * lead API can use it too.
 */
export function proposalFileName(clientName: string, year = new Date().getFullYear()): string {
  const name =
    String(clientName || 'Customer')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'Customer';
  return `${name}_PROPOSAL_${year}.pdf`;
}
