// The default email that goes with a quotation (Email on the PDF card): a greeting to the contact
// person, the company overview with our client list, and the signature of whoever is signed in.
// The web has the same text in frontend/src/pages/leads/proposalEmail.js - keep the two alike.

import { INDUSTRY_TYPES } from '../crm/types';

const CLIENTS = [
  'LSG Sky Chefs (India) Pvt. Ltd',
  'Taj SATS Air Catering Ltd',
  'MTR Foods',
  'NKP Empire Ventures Pvt. Ltd.',
  'Loyal Hospitality Pvt. Ltd. (Kitchens @)',
  'Swiggy Kitchens',
  'Rameshwaram Cafe',
  'TOIT Brewpubs',
  'Chai Days',
  'MakeMyTrip (India) Pvt. Ltd. – Corporate office',
  'Organic Industries Pvt. Ltd. – Manufacturing & warehouses',
  'Health & Glow – Retail outlets & offices',
  'Narayana Health Group – Hospitals & Clinics',
  'Narayana Nethralaya – Eye hospitals',
  'Cadabams Hospital Group – Hospitals, diagnostics & clinics',
  'Dr. B.R. Ambedkar Medical College & Hospital',
  'SDS Rajiv Gandhi Hospital',
  'The Director (DRDO - Chitradurga)',
  'NU Hospital Private Limited',
  'Hotel Dhruvatare',
  'Promount',
  'Adarsh Builder',
  'Kalpataru',
  'Nimhans Hospital',
];

export type ProposalEmail = { to: string; subject: string; body: string };

/**
 * The proposal email for a lead. `industry` is the lead's code ("restaurant"...); "other" is left
 * out. `sender` is the signed-in user.
 */
export function proposalEmail(
  lead: { companyName: string; contactPerson: string; email: string; industry?: string },
  sender: { name?: string | null; phone?: string | null } | null | undefined,
): ProposalEmail {
  const company = (lead.companyName || '').trim();
  const contact = (lead.contactPerson || '').trim();
  const industry = lead.industry && lead.industry !== 'other' ? INDUSTRY_TYPES.find(o => o.value === lead.industry)?.label ?? '' : '';
  const place = [company, industry].filter(Boolean).join(' ') || 'premises';
  const name = sender?.name?.trim();
  const phone = sender?.phone?.trim();

  const body = [
    contact ? `Dear ${contact} Ji,` : 'Dear Sir/Madam,',
    '',
    'Greetings from Bestserve Pest Management Pvt Ltd',
    '',
    `Please find the attached Pest Control Proposal for your ${place}.`,
    '',
    'Company Overview',
    '',
    'Bestserve Pest Management Pvt. Ltd. is a professionally managed pest control organization with over 14+ years of proven experience in delivering integrated pest management (IPM) solutions across healthcare, hospitality, food processing, aviation catering, retail, corporate offices, and manufacturing facilities.',
    '',
    'We currently serve more than 400 corporate clients. Few of the following reputed organizations are:',
    '',
    ...CLIENTS,
    '',
    'Looking forward to working together.',
    'Best Regards,',
    ...(name ? [name] : []),
    ...(phone ? [`Ph : ${phone}`] : []),
  ].join('\n');

  return { to: (lead.email || '').trim(), subject: `Pest Control Proposal${company ? ` - ${company}` : ''} - Bestserve Pest Management Pvt. Ltd.`, body };
}
