# Security Guide — Zott Monte Dashboard v3

## Authentication & Authorization

### Enabling Authentication

By default, the dashboard runs in **open access mode** (no login required). To enable authentication:

#### 1. Configure Environment Variables

Create a `.env` file in the project root (or configure via web server environment):

```bash
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=dashboard_v3
DB_USER=root
DB_PASS=your_secure_db_password

# Authentication
AUTH_ENABLED=1
AUTH_USERNAME=admin
AUTH_PASSWORD=your_secure_admin_password
```

**Never commit `.env` to version control.** Use `.env.example` as a template for your team.

#### 2. Access Login Page

With `AUTH_ENABLED=1`, unauthenticated requests are redirected to `/login.html`.

- **Login URL**: `https://your-domain.com/login.html`
- **API Endpoint**: `POST /api/auth.php` (login) or `GET /api/auth.php` (status)

#### 3. Manage Users

Create and manage user accounts via the **Người dùng** (Users) page in the admin panel.

- Admin can create, edit, deactivate, and delete users
- Passwords are hashed with bcrypt (PASSWORD_BCRYPT)
- Users can change their password after login
- Admin can force password change on next login

---

## Security Best Practices

### Database Security

✓ **Use strong passwords** for DB user  
✓ **Restrict DB access** to application servers only  
✓ **Use parameterized queries** (all endpoints use prepared statements)  
✓ **Enable SSL** for DB connections in production  

### Password Policy

✓ **Minimum 8 characters**  
✓ **Must include letters + numbers or special characters**  
✓ **Hashed with bcrypt** (not reversible)  
✓ **No password history** (users can reuse past passwords — consider implementing)  

**Recommendation**: Increase minimum to 12 characters and require 3+ character types.

### Session Security

✓ **HTTPOnly cookies** — JavaScript cannot access session tokens  
✓ **SameSite=Lax** — prevents CSRF attacks  
✓ **Session regeneration** on login — prevents session fixation  
✓ **CSRF token validation** on all state-changing POST requests  

**Session timeout**: Currently 7 days. **Recommendation**: Implement idle timeout (30 min) + absolute timeout (8 hours).

### API Security

✓ **HTTPS enforcement** — configure web server  
✓ **CORS headers** — localhost/127.0.0.1 dev mode included  
✓ **CSRF tokens** — required on POST/PUT/DELETE endpoints  
✓ **Rate limiting** — **NOT IMPLEMENTED** (add to prevent brute force)  

### File Upload Security

✓ **File type validation** — checks MIME type via magic bytes  
✓ **Size limits** — 50 MB max per file  
✓ **No executable extensions** — `.php`, `.exe`, `.sh` blocked  
✓ **Stored outside web root** — uploads/ not directly accessible  

### Error Handling

✓ **No stack traces in production** — only in `localhost` mode  
✓ **Generic error messages** to users — sensitive details logged server-side  
✓ **Activity logging** — auth events, user changes recorded  

---

## Security Issues & Mitigations

### HIGH Priority (Should Fix)

| Issue | Status | Mitigation |
|-------|--------|-----------|
| Rate limiting on login | ❌ Not implemented | Add per-IP rate limit (5 attempts/15 min) + account lockout |
| OAuth token encryption | ❌ Tokens stored in plaintext | Encrypt with AES-256-GCM + key rotation |
| Session timeout | ❌ 7 days fixed | Implement idle (30 min) + absolute (8 hr) timeout |
| HTTPS enforcement | ❌ Not enforced | Set HSTS headers + redirect HTTP→HTTPS |
| Admin action logging | ⚠️ Minimal | Add comprehensive audit trail (who, when, IP, user-agent) |

### MEDIUM Priority (Should Consider)

| Issue | Status | Mitigation |
|-------|--------|-----------|
| Password policy | ⚠️ Weak | Increase to 12 chars + 3 char types |
| File upload validation | ✓ Good | Already checks magic bytes |
| CSRF protection | ✓ Implemented | Token validated on POST/PUT/DELETE |
| SQL injection | ✓ Protected | All queries use prepared statements |
| XSS protection | ✓ Good | Output escaped, CSP headers set |

### LOW Priority (Nice to Have)

| Issue | Status | Mitigation |
|-------|--------|-----------|
| Security.txt | ❌ Not present | Create `.well-known/security.txt` for vulnerability disclosure |
| Dependency audit | ⚠️ Manual | Run `composer audit` regularly |
| IP binding | ❌ Not implemented | Bind sessions to client IP (with proxy detection) |

---

## Deployment Checklist

Before deploying to production:

- [ ] **Environment Variables**: Configure `.env` with strong credentials
- [ ] **Database**: Set strong password for DB user
- [ ] **HTTPS**: Install SSL certificate, enable HSTS headers
- [ ] **Auth**: Decide if login required (`AUTH_ENABLED=1` or keep open)
- [ ] **Uploads**: Verify uploads/ is writable and outside web root
- [ ] **Logs**: Configure error logging to file (not visible in web)
- [ ] **Backups**: Set up automated DB backups
- [ ] **Monitoring**: Monitor failed logins, unusual activity
- [ ] **Dependencies**: Run `composer audit` to check for vulnerabilities
- [ ] **File Permissions**: Set proper directory permissions (755 for dirs, 644 for files)

---

## Troubleshooting

### "Authentication required" (401)

- Check `AUTH_ENABLED` in config
- Verify session cookie is being sent (check Network tab in DevTools)
- Ensure `credentials: 'same-origin'` is set in fetch calls

### "Admin access required" (403)

- User role is not 'admin'
- Ask admin to change user role via Users page

### Session not persisting

- Check `session.use_cookies` and `session.use_strict_mode` in php.ini
- Verify session storage directory is writable
- Clear browser cookies and try again

### Login page shows "Demo: admin / admin123"

- Only shown on localhost (for development)
- Remove or disable in production

---

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PHP Security Guide](https://www.php.net/manual/en/security.php)
- [Bcrypt Hash](https://en.wikipedia.org/wiki/Bcrypt)
- [CSRF Prevention](https://owasp.org/www-community/attacks/csrf)
- [Session Fixation](https://owasp.org/www-community/attacks/Session_fixation)

---

## Questions or Security Issues?

If you discover a security vulnerability, please:
1. **Do not** open a public issue
2. **Email** the security team with details
3. **Include** steps to reproduce and impact assessment

For questions about implementation, refer to code comments in:
- `/includes/helpers.php` — auth, session, CSRF
- `/api/auth.php` — login/logout
- `/api/users.php` — user management
