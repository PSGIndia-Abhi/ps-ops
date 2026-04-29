# Job Object Properties Reference

This document lists all available properties on the `job` object used throughout the frontend.

## Core Info
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.id` | number/string | `1` or `uuid` | Unique job identifier |
| `job.code` | string | `"J001"` | Human-readable job code |
| `job.title` | string | `"Mosquito Control"` | Job title (sub_service) |
| `job.service_type` | string | `"Pest Control"` | Service category |
| `job.notes` | string | `"Check behind equipment"` | Job notes/description |
| `job.address` | string | `"123 Main St"` | Service location address |

## Status & Approval
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.status` | string | `"NOT_STARTED"` | Status: `CREATED`, `NOT_STARTED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELED` |
| `job.display_status` | string | `"PENDING"` | Computed display status: `AWAITING_APPROVAL`, `LOST`, `PENDING`, or matches `status` |
| `job.approval_status` | string | `"PENDING"` | Approval state: `PENDING` or `APPROVED` |
| `job.approved_at` | datetime | `"2026-04-09T10:30:00Z"` | When job was approved |

## Dates & Scheduling
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.start_date` | datetime | `"2026-04-15T09:00:00Z"` | When the job starts |
| `job.dueDate` | datetime | `"2026-04-20T17:00:00Z"` | When the job is due (end date for range) |
| `job.next_visit_date` | datetime | `"2026-04-15T09:00:00Z"` | Next scheduled visit date |
| `job.created_at` | datetime | `"2026-04-09T08:00:00Z"` | When job was created |

## Relationships - Supervisor
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.supervisor_id` | number | `5` | Assigned supervisor's user ID |
| `job.supervisor` | object | `{ id: 5, name: "John", phone: "555-1234" }` | Supervisor details (list only) |
| `job.supervisor.name` | string | `"John Smith"` | Supervisor name |
| `job.supervisor.phone` | string | `"555-1234"` | Supervisor phone |

## Relationships - Team
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.team` | array | `[{ id: 106, name: "Tech 1" }]` | Array of assigned technicians |
| `job.team[0].id` | number | `106` | Technician user ID |
| `job.team[0].name` | string | `"Alice"` | Technician name |

## Relationships - Requested By (Contact)
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.requestedBy` | object | `{ id: 10, name: "Jane", ... }` | Client/contact who requested job |
| `job.requestedBy.id` | number | `10` | Contact ID |
| `job.requestedBy.name` | string | `"Jane Doe"` | Contact name |
| `job.requestedBy.phone` | string | `"555-5678"` | Contact phone |
| `job.requestedBy.email` | string | `"jane@example.com"` | Contact email |
| `job.requestedBy.company` | object | Company info | See Company section below |

## Relationships - Company/Site
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.company_id` | number | `2` | Site ID |
| `job.companyname` | string | `"Acme Corp"` | Company name (list only) |
| `job.site` | string | `"Main Office"` | Site name (list only) |
| `job.requestedBy.company.id` | number | `2` | Site/company ID |
| `job.requestedBy.company.code` | string | `"ACME-001"` | Company code |
| `job.requestedBy.company.type` | string | `"Commercial"` | Company type |
| `job.requestedBy.company.site` | string | `"Main Office"` | Site name |

## Relationships - Booking
| Property | Type | Example | Notes |
|----------|------|---------|-------|
| `job.booking_id` | number | `1` | Associated booking ID |
| `job.booking_code` | string | `"B001"` | Booking code |
| `job.has_recurring` | boolean | `true` | Whether booking has recurring schedule |

---

## Common Usage Patterns

### Check if job has dates
```javascript
if (job.start_date) {
  console.log("Job scheduled for:", formatDate(job.start_date));
}
```

### Check if job is awaiting approval
```javascript
const awaitingApproval = job.approval_status === "PENDING" && 
  ["IN_PROGRESS", "PAUSED"].includes(job.status);
```

### Check if job lost (overdue)
```javascript
const isLost = job.display_status === "LOST";
```

### Check if job can be started
```javascript
const canStart = job.status === "NOT_STARTED" && 
  !isCanceled && !isLost;
```

### Format dates
```javascript
formatDate(job.start_date)  // "09/04/2026" (en-GB)
formatTime(job.start_date)  // "09:00" or "-" if no time
```

---

## Notes

- **From list endpoint** (`GET /api/jobs`): Returns jobs without some details like `display_status`, `approved_at`, `has_recurring`
- **From single endpoint** (`GET /api/jobs/:jobId`): Returns full job details including computed fields
- **Team JSON**: Stored in DB as JSON array, automatically parsed by backend
- **Status flow**: `CREATED` → `NOT_STARTED` → `IN_PROGRESS` → `PAUSED` → `COMPLETED` or `CANCELED`
