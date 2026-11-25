/**
 * The services a client can pick in "Request a service". Same lists the staff booking form uses
 * (staff app CreateBookingScreen / web CreateBookingModal), so a request maps straight onto a booking.
 * Keep these in step with the staff lists if those change.
 */
export const PEST_SERVICES = [
  'General Pest Control (GPC)',
  'General Pest Control + Rodent Control (GPC + RC)',
  'Mosquito Treatment',
  'Mosquito Fogging',
  'Mosquito IRS (Indoor Residual Spray)',
  'Mosquito Larval Treatment',
  'Cockroach Treatment',
  'Cockroach Gel Treatment',
  'Ant Treatment',
  'Fly Treatment',
  'Bed Bug Treatment',
  'Snake Control',
  'Honey Bee Treatment',
  'Rodent Control',
  'Drainage Treatment',
  'Termite Pre-Construction Treatment',
  'Termite Post-Construction Treatment',
  'Lizard Control',
  'Deep Fumigation',
];

export const DEEP_CLEANING_SERVICES = [
  'Floor Protection',
  'Electrical Shifting',
  'Electrical New Point Installation',
  'Plumbing Work',
  'Painting Work',
  'Regular Cleaning',
  'Deep Cleaning',
  'Deep Cleaning with Scrubbing',
  'Deep Cleaning with Sticker Removal',
  'Debris Removal',
];

/** Groups shown as filters in "Choose services". */
export type ServiceGroup = 'general' | 'mosquito' | 'insects' | 'rodent' | 'termite' | 'cleaning' | 'works';

export const GROUP_LABEL: Record<ServiceGroup, string> = {
  general: 'General',
  mosquito: 'Mosquito',
  insects: 'Insects',
  rodent: 'Rodent & snake',
  termite: 'Termite',
  cleaning: 'Cleaning',
  works: 'Repairs',
};

/**
 * How a service is shown: its name without the code in brackets, the code itself
 * ("General Pest Control (GPC)" -> "General Pest Control" + "GPC") and its group.
 * The full original name is still what gets sent with the request.
 */
export function serviceMeta(name: string): { title: string; code: string | null; group: ServiceGroup } {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(name);
  const title = m ? m[1] : name;
  const code = m ? m[2] : null;
  const n = name.toLowerCase();
  let group: ServiceGroup;
  if (DEEP_CLEANING_SERVICES.includes(name)) {
    group = /electrical|plumbing|painting/.test(n) ? 'works' : 'cleaning';
  } else if (n.startsWith('general') || /drainage|fumigation/.test(n)) group = 'general';
  else if (n.includes('mosquito')) group = 'mosquito';
  else if (n.includes('termite')) group = 'termite';
  else if (/rodent|snake/.test(n)) group = 'rodent';
  else group = 'insects';
  return { title, code, group };
}
