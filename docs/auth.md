# Аутентифікація та авторизація

## Мета

Цей документ описує, як працює аутентифікація через OAuth (Google) та авторизація через JWT access token + refresh-сесії (cookie) в проєкті, а також як має інтегруватись фронтенд.

## Базові принципи

- Аутентифікація через зовнішнього провайдера (Google) відбувається на бекенді.
- Фронтенд не використовує Google SDK для логіну: лише redirect на бекенд.
- `accessToken` — короткоживучий JWT (Bearer), використовується для доступу до захищених API.
- `refresh_token` — довгоживучий токен, зберігається як `httpOnly` cookie.
- Refresh токени зберігаються в БД як хеш (SHA-256), а не у відкритому вигляді.
- Підтримується rotation refresh токенів і захист від reuse (повна ревокація сесій користувача при повторному використанні).

## Терміни

- **Access token**: JWT, TTL `15m`, передається у `Authorization: Bearer ...`.
- **Refresh token**: випадковий рядок, TTL `7 days`, зберігається в cookie `refresh_token`, використовується для отримання нового access token.
- **Session**: запис у БД, що містить `tokenHash`, `expiresAt`, `revoked`, а також метадані (ip, userAgent, deviceId).

## Ендпоінти

### Початок OAuth (Google)

- `GET /auth/google`
  - Redirect на Google OAuth.
  - Використовується з клієнта як `window.location.href = API_URL + '/auth/google'`.

### OAuth callback (Google)

- `GET /auth/google/callback`
  - Бекенд:
    - знаходить або створює `User` + `Account(provider, providerAccountId)`
    - знаходить існуючий `Device` (за `userId + name + platform + userAgent`) або створює новий
    - створює `Session` з `tokenHash`
    - ставить cookie `refresh_token` (httpOnly)
    - робить redirect на фронтенд (`/auth/callback`) без передачі `access` у query

### Оновлення токенів (refresh rotation)

- `POST /auth/refresh`
  - Вхід:
    - refresh токен береться або з cookie `refresh_token`, або з `Authorization: Bearer ...` (fallback).
  - Вихід:
    - `{ accessToken: string }`
    - оновлена cookie `refresh_token`
  - Поведінка:
    - якщо сесія не знайдена / протермінована → `401`
    - якщо сесія `revoked=true` → `401` + ревокація всіх сесій користувача (reuse detection)
    - інакше — ревокація поточної сесії і видача нової

### Отримання access token без rotation

- `POST /auth/access`
  - Призначення:
    - отримати `accessToken` з поточної refresh-сесії без створення нової `Session`.
    - використовується на `FRONTEND_URL/auth/callback`, щоб уникнути створення 2 session-записів одразу після логіну.
  - Вхід:
    - refresh токен береться з cookie `refresh_token`.
  - Вихід:
    - `{ accessToken: string }`
  - Поведінка:
    - якщо сесія не знайдена / протермінована / revoked → `401`
    - endpoint не ротейтить refresh token і не створює нову session.

### Перевірка сесії (для SSR/UI без флікеру)

- `GET /auth/session`
  - Призначення:
    - lightweight перевірка, чи валідна поточна refresh-сесія.
    - використовується фронтендом для SSR-рішення "авторизований / неавторизований" без клієнтського миготіння.
  - Вхід:
    - refresh токен береться з cookie `refresh_token`.
  - Вихід:
    - `{ authenticated: true | false }`
  - Поведінка:
    - якщо cookie відсутня або токен невалідний/прострочений/ревокнутий → `{ authenticated: false }`
    - endpoint не виконує rotation і не видає access token.

### Logout (поточна сесія)

- `POST /auth/logout`
  - Ревокує сесію, що відповідає поточному refresh токену.
  - Відповідь: `{ ok: true }`

### Logout (всі сесії)

- `POST /auth/logout-all`
  - Вимагає `Authorization: Bearer <accessToken>`.
  - Ревокує всі сесії користувача.
  - Відповідь: `{ ok: true }`

## Обов'язковий workflow для фронтенду

1. Кнопка "Sign in with Google" робить redirect на `GET /auth/google`.
2. Для SSR-рендеру сторінок (наприклад `/`) фронтенд може викликати `GET /auth/session` на сервері:
   - якщо `authenticated=true` — одразу рендерити auth UI (без флікеру)
   - якщо `authenticated=false` — рендерити публічний UI (login button тощо)
3. Після редіректу з бекенду на `FRONTEND_URL/auth/callback`:
   - одразу виконати `POST /auth/access` з `credentials: 'include'`
   - зберегти `accessToken` у пам'яті (store/state)
4. Усі запити до захищених API:
   - додавати `Authorization: Bearer <accessToken>`
5. На `401 Unauthorized`:
   - виконати `POST /auth/refresh` з `credentials: 'include'`
   - оновити access token у store/state
   - повторити оригінальний запит один раз
6. Якщо `refresh` теж повернув `401`:
   - очистити access token у клієнта
   - редірект на `/login`

## Приклади (fetch)

### Старт логіну

- Redirect:

```js
window.location.href = `${API_URL}/auth/google`;
```

### Запит з access token

```js
await fetch(`${API_URL}/protected`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
```

### Refresh

```js
const res = await fetch(`${API_URL}/auth/refresh`, {
  method: 'POST',
  credentials: 'include',
});
if (!res.ok) throw new Error('refresh failed');
const { accessToken } = await res.json();
```

### Access (callback, without rotation)

```js
const res = await fetch(`${API_URL}/auth/access`, {
  method: 'POST',
  credentials: 'include',
});
if (!res.ok) throw new Error('access failed');
const { accessToken } = await res.json();
```

### Session check (SSR)

```js
const res = await fetch(`${API_URL}/auth/session`, {
  method: 'GET',
  headers: {
    cookie: requestCookies, // "name=value; name2=value2"
  },
  cache: 'no-store',
});
const { authenticated } = await res.json();
```

### Logout

```js
await fetch(`${API_URL}/auth/logout`, {
  method: 'POST',
  credentials: 'include',
});
```

## Do / Don't

### Do

- Використовуй redirect на бекенд для старту OAuth.
- Для SSR перевірки логіну використовуй `/auth/session`.
- Після OAuth callback одразу виконуй `/auth/access` з `credentials: 'include'` для отримання access token без rotation.
- Для `/auth/refresh` завжди використовуй `credentials: 'include'`.
- Роби retry оригінального запиту після успішного refresh рівно один раз.

### Don't

- Не використовуй Google SDK на фронтенді для цього флоу.
- Не зберігай refresh token у localStorage/sessionStorage.
- Не використовуй `/auth/session` як заміну `/auth/refresh` (він не видає access token).
- Не використовуй `/auth/access` як глобальну заміну `/auth/refresh` для recovery по `401`.
- Не роби нескінченні refresh-цикли при `401`.
- Не передавай refresh токен у JS-коді (cookie має бути httpOnly).

## Чекліст перед merge

- Фронтенд робить redirect на `GET /auth/google`.
- Для SSR-сторінок за потреби використовується `GET /auth/session`.
- На callback сторінці викликається `/auth/access` з `credentials: include`.
- Всі захищені запити мають `Authorization: Bearer ...`.
- Реалізований refresh по `401` з `credentials: include`.
- Реалізований logout + cleanup клієнтського стану.
- Документація оновлена при зміні флоу.
