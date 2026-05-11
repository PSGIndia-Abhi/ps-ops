import { expect } from '@playwright/test';

export const roleHome = {
  admin: '/admin',
  branch_admin: '/admin',
  supervisor: '/supervisor',
  technician: '/technician',
  client: '/client',
};

const usersByEmail = {
  'admin@test.com': { role: 'admin', name: 'Admin User', user_id: 1 },
  'branchadmin@test.com': { role: 'branch_admin', name: 'Branch Admin', user_id: 2 },
  'supervisor@test.com': { role: 'supervisor', name: 'Supervisor User', user_id: 3 },
  'technician@test.com': { role: 'technician', name: 'Technician User', user_id: 4 },
  'client@test.com': {
    role: 'client',
    name: 'Client User',
    user_id: 5,
    contact_id: 50,
  },
};

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function makeToken(role, id = 1) {
  const payload = Buffer.from(JSON.stringify({ id, role })).toString('base64');
  return `e2e.${payload}.token`;
}

function roleFromRequest(request) {
  const auth = request.headers().authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return payload.role || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

const allJobs = [
  {
    id: 101,
    code: 'JOB-NORTH-101',
    title: 'Deep Cleaning',
    service_type: 'Housekeeping',
    status: 'IN_PROGRESS',
    display_status: 'IN_PROGRESS',
    companyname: 'Acme Facilities',
    company_name: 'Acme Facilities',
    company_code: 'ACME',
    company_site: 'Tower A',
    site: 'Tower A',
    branch_id: 10,
    branch_name: 'North Branch',
    start_date: today,
    dueDate: today,
    notes: 'Lobby cleaning in progress',
    supervisor: { id: 3, name: 'Supervisor User' },
    team: [{ id: 4, name: 'Technician User' }],
    requestedBy: { id: 50, name: 'North Contact' },
  },
  {
    id: 202,
    code: 'JOB-SOUTH-202',
    title: 'Pest Control',
    service_type: 'Pest Control',
    status: 'NOT_STARTED',
    display_status: 'NOT_STARTED',
    companyname: 'Orbit Mall',
    company_name: 'Orbit Mall',
    company_code: 'ORBIT',
    company_site: 'South Wing',
    site: 'South Wing',
    branch_id: 20,
    branch_name: 'South Branch',
    start_date: tomorrow,
    dueDate: tomorrow,
    supervisor: { id: 30, name: 'South Supervisor' },
    team: [{ id: 40, name: 'South Technician' }],
    requestedBy: { id: 60, name: 'South Contact' },
  },
  {
    id: 303,
    code: 'JOB-CLIENT-303',
    title: 'Client AC Service',
    service_type: 'AC Service',
    status: 'IN_PROGRESS',
    display_status: 'IN_PROGRESS',
    companyname: 'ClientCo',
    company_name: 'ClientCo',
    company_code: 'CLIENT',
    company_site: 'Client Office',
    site: 'Client Office',
    branch_id: 10,
    branch_name: 'North Branch',
    contact_id: 50,
    start_date: today,
    dueDate: today,
    notes: 'Client-only job',
    supervisor: { id: 3, name: 'Supervisor User' },
    team: [{ id: 4, name: 'Technician User' }],
    requestedBy: { id: 50, name: 'Client User' },
  },
];

const allBookings = [
  {
    id: 201,
    code: 'BK-NORTH',
    company_name: 'Acme Facilities',
    company_code: 'ACME',
    company_site: 'Tower A',
    contact_id: 50,
    contact_name: 'North Contact',
    branch_id: 10,
    jobs: [allJobs[0]],
  },
  {
    id: 202,
    code: 'BK-SOUTH',
    company_name: 'Orbit Mall',
    company_code: 'ORBIT',
    company_site: 'South Wing',
    contact_id: 60,
    contact_name: 'South Contact',
    branch_id: 20,
    jobs: [allJobs[1]],
  },
  {
    id: 203,
    code: 'BK-CLIENT',
    company_name: 'ClientCo',
    company_code: 'CLIENT',
    company_site: 'Client Office',
    contact_id: 50,
    contact_name: 'Client User',
    branch_id: 10,
    jobs: [allJobs[2]],
  },
];

const allVisits = [
  {
    id: 301,
    job_id: 101,
    sub_service: 'Deep Cleaning',
    address: 'Tower A, Bengaluru',
    scheduled_date: `${today}T10:00:00.000Z`,
    companyname: 'Acme Facilities',
    sitename: 'Tower A',
    status: 'SCHEDULED',
    visit_number: 1,
    technicians: [{ id: 4, name: 'Technician User' }],
  },
  {
    id: 302,
    job_id: 202,
    sub_service: 'Pest Control',
    address: 'South Wing, Bengaluru',
    scheduled_date: `${tomorrow}T10:00:00.000Z`,
    companyname: 'Orbit Mall',
    sitename: 'South Wing',
    status: 'SCHEDULED',
    visit_number: 1,
    technicians: [{ id: 40, name: 'South Technician' }],
  },
];

const allTickets = [
  {
    id: 401,
    subject: 'North branch ticket',
    status: 'OPEN',
    priority: 'low',
    created_at: today,
    branch_id: 10,
    created_by: { name: 'North Contact' },
    jobs: [allJobs[0]],
    messages: [{ id: 1, message: 'Need help at Tower A', created_at: today, created_by: { name: 'North Contact' } }],
  },
  {
    id: 402,
    subject: 'South branch ticket',
    status: 'OPEN',
    priority: 'high',
    created_at: today,
    branch_id: 20,
    created_by: { name: 'South Contact' },
    jobs: [allJobs[1]],
    messages: [{ id: 2, message: 'Need help at South Wing', created_at: today, created_by: { name: 'South Contact' } }],
  },
  {
    id: 403,
    subject: 'Client ticket',
    status: 'OPEN',
    priority: 'medium',
    created_at: today,
    branch_id: 10,
    contact_id: 50,
    created_by: { name: 'Client User' },
    jobs: [allJobs[2]],
    messages: [{ id: 3, message: 'Client needs update', created_at: today, created_by: { name: 'Client User' } }],
  },
];

function scopedJobs(role) {
  switch (role) {
    case 'admin':
      return allJobs;
    case 'branch_admin':
    case 'supervisor':
      return allJobs.filter((job) => job.branch_id === 10 && job.id !== 303);
    case 'technician':
      return allJobs.filter((job) => job.team?.some((tech) => tech.id === 4));
    case 'client':
      return allJobs.filter((job) => job.contact_id === 50 && job.id === 303);
    default:
      return [];
  }
}

function scopedBookings(role) {
  switch (role) {
    case 'admin':
      return allBookings;
    case 'branch_admin':
    case 'supervisor':
      return allBookings.filter((booking) => booking.branch_id === 10 && booking.id !== 203);
    case 'client':
      return allBookings.filter((booking) => booking.contact_id === 50 && booking.id === 203);
    default:
      return [];
  }
}

function scopedVisits(role) {
  return role === 'technician'
    ? allVisits.filter((visit) => visit.technicians?.some((tech) => tech.id === 4))
    : allVisits;
}

function scopedTickets(role) {
  switch (role) {
    case 'admin':
      return allTickets;
    case 'branch_admin':
    case 'supervisor':
      return allTickets.filter((ticket) => ticket.branch_id === 10 && ticket.id !== 403);
    case 'client':
      return allTickets.filter((ticket) => ticket.contact_id === 50);
    default:
      return [];
  }
}

function json(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

function normalizePath(url) {
  const apiIndex = url.pathname.indexOf('/api/');
  return apiIndex >= 0 ? url.pathname.slice(apiIndex) : url.pathname;
}

export async function mockApi(page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = normalizePath(url);
    const role = roleFromRequest(request);

    if (path === '/api/auth/login' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const user = usersByEmail[body.email];

      if (!user || body.password !== 'Password123') {
        await route.fulfill(json({ error: 'Invalid credentials' }, 401));
        return;
      }

      await route.fulfill(json({
        token: makeToken(user.role, user.user_id),
        role: user.role,
        user_id: user.user_id,
        contact_id: user.contact_id,
      }));
      return;
    }

    if (path === '/api/auth/me') {
      await route.fulfill(json({
        id: 1,
        name: 'E2E User',
        email: 'e2e@example.com',
        branch: { name: 'Central Branch' },
        branch_admin: {
          name: 'Account Manager',
          email: 'manager@example.com',
          phone: '9999999999',
        },
      }));
      return;
    }

    if (path === '/api/jobs') {
      await route.fulfill(json(scopedJobs(role)));
      return;
    }

    const jobMatch = path.match(/^\/api\/jobs\/(\d+)$/);
    if (jobMatch) {
      const jobId = Number(jobMatch[1]);
      const job = scopedJobs(role).find((item) => item.id === jobId);
      await route.fulfill(job ? json(job) : json({ error: 'Job not found' }, 403));
      return;
    }

    if (path.match(/^\/api\/jobs\/\d+\/history$/)) {
      await route.fulfill(json([]));
      return;
    }

    if (path === '/api/bookings') {
      await route.fulfill(json(scopedBookings(role)));
      return;
    }

    if (path === '/api/users') {
      const requestedRole = url.searchParams.get('role');
      const branchUsers = requestedRole === 'technician'
        ? [{ id: 4, name: 'Technician User', branch_name: 'North Branch', email: 'technician@example.com' }]
        : [{ id: 3, name: 'Supervisor User', branch_name: 'North Branch', email: 'supervisor@example.com' }];
      const allUsers = requestedRole === 'technician'
        ? [...branchUsers, { id: 40, name: 'South Technician', branch_name: 'South Branch', email: 'south-tech@example.com' }]
        : [...branchUsers, { id: 30, name: 'South Supervisor', branch_name: 'South Branch', email: 'south-supervisor@example.com' }];
      await route.fulfill(json([
        ...(role === 'admin' ? allUsers : branchUsers),
      ]));
      return;
    }

    if (path === '/api/teams/my/team') {
      await route.fulfill(json([
        { id: 4, name: 'Technician User', branch_name: 'North Branch' },
      ]));
      return;
    }

    if (path === '/api/visits/my') {
      await route.fulfill(json(scopedVisits(role)));
      return;
    }

    if (path.match(/^\/api\/visits\/jobs\/\d+\/visits$/)) {
      const jobId = Number(path.match(/^\/api\/visits\/jobs\/(\d+)\/visits$/)[1]);
      await route.fulfill(json(scopedVisits(role).filter((visit) => visit.job_id === jobId)));
      return;
    }

    if (path === '/api/visits/client/upcoming') {
      await route.fulfill(json({
        title: 'Deep Cleaning',
        scheduled_date: `${today}T10:00:00.000Z`,
      }));
      return;
    }

    if (path === '/api/tickets') {
      await route.fulfill(json(scopedTickets(role)));
      return;
    }

    if (path === '/api/jobs/assign' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const allowedIds = scopedJobs(role).map((job) => job.id);
      const canAssign = body.jobIds?.every((id) => allowedIds.includes(id));
      await route.fulfill(canAssign ? json({ ok: true }) : json({ error: 'Forbidden' }, 403));
      return;
    }

    await route.fulfill(json([]));
  });
}

export async function seedAuth(page, role) {
  const token = makeToken(role, usersByEmail[`${role === 'branch_admin' ? 'branchadmin' : role}@test.com`]?.user_id || 1);
  await page.addInitScript(([authRole, authToken]) => {
    window.localStorage.setItem('token', authToken);
    window.localStorage.setItem('role', authRole);
    window.localStorage.setItem('userId', '1');
    if (authRole === 'client') window.localStorage.setItem('contactId', '50');
  }, [role, token]);
}

export async function expectRedirectHome(page, role) {
  await expect(page).toHaveURL(new RegExp(`${roleHome[role]}$`));
}
