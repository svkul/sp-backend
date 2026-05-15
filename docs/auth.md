# Аутентифікація та авторизація

Cloudflare Turnstile flow:
[User clicks button]
↓
Next.js
↓
POST /auth/google/start
↓
NestJS
↓
Turnstile verify (Cloudflare API)
↓
OK? ────── no → reject
↓ yes
generate Google OAuth URL
↓
return redirectUrl
↓
Frontend redirects user
↓
Google OAuth flow

Закриваємо origin:
Railway public domain + WAF rule на backend: блокувати запити без заголовка CF-Connecting-IP або без валідного Cf-Access-Client-Id (Cloudflare Access service token).
