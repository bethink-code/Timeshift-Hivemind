---
name: add-admin-console
description: Add a full admin console to an existing React + Express app. User management, audit logging, invite system, access requests, security overview, AI cost tracking.
---

# Add Admin Console

Add a complete admin console with user management, audit trail, invite-only access control, and security monitoring to an existing authenticated application.

## Prerequisites

- Existing React + Express app with authentication
- PostgreSQL database with Drizzle ORM
- Users table with `is_admin` boolean column

## What to implement

### 1. Database tables

Add these tables if they don't exist:

**audit_logs**
- id, user_id, user_email, action, resource_type, resource_id, outcome, detail, ip_address, created_at
- Indexes on user_id, action, created_at

**invited_users**
- id, email (unique), invited_by (FK to users), created_at

**access_requests**
- id, name, email, cell, status (pending/approved/declined), created_at

**ai_usage** (for AI cost tracking)
- id, user_id, user_email, action, model, input_tokens, output_tokens, estimated_cost_usd, created_at

### 2. Audit logger (server/auditLog.ts)

Create a fire-and-forget audit logger:
```typescript
export function audit(req, { action, resourceType?, resourceId?, outcome?, detail? })
```
- Extracts user ID and email from `req.user`
- Extracts IP from `req.ip` or `x-forwarded-for`
- Inserts into `audit_logs` table
- Never throws — wraps in try/catch so it never breaks the request
- Export `queryAuditLogs(filters)` for the admin endpoint

### 3. Admin middleware

Create `isAdmin` middleware:
- Checks `req.user.isAdmin === true`
- Returns 403 if not admin
- Apply to all `/api/admin/*` routes

### 4. API routes

Add these admin-only routes:

- `GET /api/admin/users` — list all users
- `PATCH /api/admin/users/:id/admin` — toggle admin (prevent self-removal)
- `GET /api/admin/invites` — list invited emails
- `POST /api/admin/invites` — add invite (validate email format)
- `DELETE /api/admin/invites/:id` — remove invite
- `GET /api/admin/access-requests` — list access requests
- `PATCH /api/admin/access-requests/:id` — approve (auto-creates invite) or decline
- `GET /api/admin/security-overview` — active sessions, user stats, 24h activity, access denials
- `GET /api/admin/audit-logs` — paginated audit log with action/outcome filters
- `GET /api/admin/ai-usage` — AI cost summary, per-user breakdown, recent calls

Add public route:
- `POST /api/request-access` — submit access request (name, email, cell)

Add pending request count to user response:
- `GET /api/auth/user` — include `pendingRequestCount` for admin users

### 5. Invite-only login blocking

In the OAuth callback:
- After Google authenticates the user, check if their email exists in `invited_users`
- If not invited: redirect to `/?error=not_invited`
- Log the blocked attempt to audit_logs directly (user isn't authenticated yet)
- Auto-invite existing users (migration): insert all current user emails into `invited_users`

### 6. Terms of use

- Add `terms_accepted_at` column to users table
- Add `POST /api/user/accept-terms` endpoint
- Create TermsModal component that blocks the app until terms are accepted
- Content: pre-alpha disclaimer, data handling, POPIA compliance, no guarantees

### 7. Admin Console page (client/src/pages/Admin.tsx)

Single page with tabbed navigation:

**Users tab**: List all users with name, email, admin badge, "Make Admin" button
**Audit Log tab**: Paginated log with action/outcome filters, refresh button
**Invites tab**: List invites with add/remove functionality
**Requests tab**: Pending access requests with approve/decline buttons, badge count
**Security tab**: Active sessions, total users, pending invites, 24h activity breakdown, access denials
**AI Costs tab**: Total calls, tokens, cost. Per-user breakdown. Recent call history.

### 8. Navigation

- Add "Admin Console" link to user dropdown menu (visible only to admins)
- Show notification badge on avatar when pending access requests exist
- Add route `/admin` to the app router

### 9. Audit logging integration

Add `audit()` calls to all sensitive operations throughout the app:
- Authentication events (login, logout, login blocked)
- Data mutations (create, update, delete)
- File operations (upload, process, export)
- Admin actions (make admin, invite, approve/decline)
- Access denials (ownership check failures)
- Terms acceptance

## Output

After implementation:
1. Push schema to dev database
2. Provide SQL for production database table creation
3. Set current user as admin via SQL
4. Rebuild API bundle
