# Аутентифікація та авторизація

Документ описує поведінку NestJS API для auth у поточному репозиторії (Google OIDC, cookies, JWT access + opaque refresh, guards).

## Терміни

- **Аутентифікація** — доведено особистість (OAuth Google, сесія в БД, JWT у cookie або Bearer).
- **Авторизація** — перевірка прав після аутентифікації (роль користувача через `@Roles`, з опорою на `JwtAuthGuard`).

## Загальний потік входу (web)

1. Користувач на фронті проходить Cloudflare Turnstile і натискає «увійти».
2. Браузер робить `POST` на BFF фронту (`/api/auth/google/start`), який проксує на **`POST /auth/google/start`** з тілом `{ turnstileToken, returnTo? }`.
3. Backend верифікує Turnstile, зберігає OAuth state (PKCE + nonce) у БД, повертає `{ redirectUrl }`.
4. Браузер переходить на Google; після згоди Google робить редірект на **`GET /auth/google/callback`** на хості API (не на Next.js).
5. Backend атомарно «споживає» state, обмінює `code` на токени через `openid-client`, перевіряє ID Token (`iss` / `aud` / `exp` / `nonce` тощо), вимагає підтверджений email (`email_verified`).
6. Створюється/оновлюється користувач і сесія; у відповідь виставляються cookies (`__Secure-access`, `__Secure-refresh`, `__Secure-csrf`) і виконується редірект на безпечний `returnTo` на origin фронту (`safeReturnTo`).

Деталі фронтового шару — у `frontend/docs/auth.md`.

## Endpoints (`AuthController`, префікс `/auth`)

| Метод | Шлях | Доступ | Примітки |
|-------|------|--------|----------|
| `POST` | `/auth/google/start` | `@Public`, `@SkipCsrf` | Turnstile + побудова URL Google; без сесії |
| `GET` | `/auth/google/callback` | `@Public` | Query `code`, `state`; CSRF guard не застосовується до `GET` |
| `POST` | `/auth/refresh` | `@Public` | Ротація refresh; читає `__Secure-refresh` або `Authorization: Bearer` |
| `POST` | `/auth/logout` | JWT | Відкликає поточну сесію, чистить cookies |
| `POST` | `/auth/logout-all` | JWT | Потребує «свіжий» access JWT (видано ≤ 5 хв), інакше `403 reauth_required` |
| `GET` | `/auth/me` | JWT | Профіль з БД (без кешу на клієнті) |

Інші захищені маршрути за замовчуванням вимагають валідний access JWT і активну сесію, якщо не позначені `@Public()`.

## Cookies (`cookies.ts`)

Після успішного логіну або refresh:

- **`__Secure-access`** — JWT access, `HttpOnly`, `SameSite=Lax`, шлях `/`.
- **`__Secure-refresh`** — сирий opaque refresh, `HttpOnly`, `SameSite=Lax`, шлях **`/api/auth`** (узгоджено з BFF: refresh летить лише на маршрути під `/api/auth/*`).
- **`__Secure-csrf`** — випадковий токен, **не** `HttpOnly`, `SameSite=Strict`, шлях `/`; браузер повинен дублювати його в заголовку `X-CSRF-Token` на мутаціях (double-submit).

У продакшені cookies позначаються `Secure`; домен задається конфігом (`cookieDomain`), щоб сесія була доступна між піддоменами застосунку.

## JWT і сесія

- **`JwtAuthGuard`** (глобальний): дістає access спочатку з `__Secure-access`, інакше з `Authorization: Bearer`.
- Після верифікації JWT перевіряється активність сесії за `sid` у payload через **`SessionService.isSessionActive`** (кеш Redis ~30 с для «швидкого» відкликання після logout).
- **`RolesGuard`** (глобальний): якщо на handler є `@Roles(...)`, роль з `req.user` має збігатися; без декоратора роль не обмежується.

Публічні маршрути: метадані **`@Public()`** знімають вимогу JWT (guard пропускає до перевірки токена).

## CSRF (`CsrfGuard`)

- Застосовується до **`POST` / `PUT` / `PATCH` / `DELETE`**.
- Перевірка **Origin або Referer** — має входити до списку дозволених origin (`web.corsOrigins`).
- **Double-submit**: значення cookie `__Secure-csrf` порівнюється з заголовком **`X-CSRF-Token`** (constant-time).
- **`@SkipCsrf()`** — для окремих endpoint’ів (наприклад `/auth/google/start`, де замість CSRF використовується Turnstile).

`POST /auth/refresh` **не** має `@SkipCsrf`: refresh має відправлятися з валідним CSRF header (на фронті це робить `clientFetch` / узгоджені виклики).

## Refresh: ротація та reuse detection

- У БД зберігається лише **SHA-256** від сирого refresh; сам рядок живе лише в cookie (або в Bearer для mobile).
- Кожен успішний refresh **відкликає** попередній рядок і видає новий (ротація).
- Якщо надійшов уже відкликаний (replay / витік) — **`InvalidRefreshTokenError` з `reuse_detected`** → логіка сервісу відкликає ланцюжок сесій користувача (захист від повторного використання вкраденого токена).

## OAuth безпека

- PKCE **S256**, **state**, **nonce**; запис **`OAuthState`** у Postgres з TTL та одноразовим consume (race-safe через умовні оновлення).
- Небезпечні **`returnTo`** (інший host, `//evil…`) відкидаються — редірект лише на дозволений frontend origin або відносний шлях на ньому.

## Глобальні guards (порядок у `AppModule`)

1. `ThrottlerGuard` — обмеження частоти (storage Redis для кількох інстансів).
2. `CsrfGuard` — див. вище.
3. `JwtAuthGuard` — аутентифікація (або `@Public`).
4. `RolesGuard` — авторизація за роллю.

## Захист HTTP (`main.ts`)

- `helmet` (у проді CSP для відповідей API, HSTS, CORP same-site, COOP same-origin, Referrer-Policy тощо).
- CORS: `credentials: true`, обмежений набір методів і заголовків (`Content-Type`, `X-CSRF-Token`, `Authorization`).
- `cookie-parser` з підписаним секретом для cookie.
- `trust proxy` для коректних `https` за реверс-проксі (Cloudflare).

## Інфраструктура та origin

Закриття публічного доступу до «голого» Railway/API:

- публічний домен за Cloudflare + WAF (наприклад очікування `CF-Connecting-IP` або валідного service token у заголовку доступу).

Це доповнює захист на рівні застосунку (Turnstile, throttling, CSRF, OAuth).

## Конфігурація

Перелік змінних середовища для backend див. у кореневій конфігурації проєкту та Railway; без розкриття секретів у документації.
