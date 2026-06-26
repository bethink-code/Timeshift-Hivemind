---
name: add-security-hardening
description: Add comprehensive security hardening to an existing Express + Node.js project. Helmet, CORS, rate limiting, input validation, error sanitization, ownership checks.
---

# Add Security Hardening

Apply production-grade security hardening to an existing Express application. This skill reads the current codebase and adds missing security layers.

## Pre-flight

Before making changes, audit the current state:
1. Read `package.json` for existing security packages
2. Read the main server entry point (index.ts/app.ts) for existing middleware
3. Read routes file(s) for authentication and authorization patterns
4. Run `npm audit` to check for vulnerable dependencies

## What to implement

### 1. Security headers (Helmet.js)
- Install `helmet` if not present
- Add to both dev server and production entry point
- Relax CSP `scriptSrc` for development (Vite uses inline scripts)
- Keep strict defaults for production

### 2. CORS policy
- Install `cors` if not present
- Configure explicit origin restriction:
  - Production: the app's domain only
  - Development: `http://localhost:PORT`
  - Configurable via `CORS_ORIGIN` env var
- Enable `credentials: true` for session cookies

### 3. Rate limiting
- Install `express-rate-limit` if not present
- Global API limiter: 200 requests per 15 minutes per IP
- Stricter limiters for sensitive endpoints (auth, AI, file upload)

### 4. Authentication enforcement
- Verify EVERY `/api/*` route has `isAuthenticated` middleware
- Exceptions only for: login, callback, logout, public access request
- Create `isAuthenticated` middleware if it doesn't exist

### 5. Ownership checks
- Create `assertOwner` helper pattern:
  ```typescript
  async function assertResourceOwner(req, resourceId) {
    const resource = await storage.getResource(resourceId);
    if (!resource) throw { status: 404, message: "Not found" };
    if (resource.userId !== req.user.id) throw { status: 403, message: "Access denied" };
    return resource;
  }
  ```
- Apply to all routes that access user-scoped data

### 6. Input validation
- Ensure Zod schemas exist for all POST/PATCH/PUT request bodies
- Validate before processing, return 400 with generic error on failure

### 7. Error sanitization
- Add global error handler that catches unhandled errors
- Never send `error.message`, `error.stack`, or internal details to client
- Log full error server-side, return generic message to client
- Pattern:
  ```typescript
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });
  ```

### 8. Sensitive data protection
- Scrub card numbers/PANs from stored data (mask to last 4 digits)
- Sanitize uploaded filenames (strip all except `a-zA-Z0-9._- `)
- Add decompression bomb protection (row count limits on file uploads)
- Ensure passwords/tokens are never logged

### 9. Dependency audit
- Run `npm audit fix` for safe patches
- Remove unused dependencies (especially those with CVEs)
- Document any unfixable vulnerabilities with mitigation notes

### 10. Security response headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (modern browsers)
- `Strict-Transport-Security` (via Helmet)
- Remove `X-Powered-By`

## Output

After applying all changes:
1. List every change made with file paths
2. Note any vulnerabilities that couldn't be fixed automatically
3. Recommend running `/pentest-security-audit` for a full verification
4. Rebuild the API bundle if applicable (`npm run build:api`)
