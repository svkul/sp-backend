# Аутентифікація та авторизація

## Мета

Цей документ описує, як працює аутентифікація через OAuth (Google) та авторизація через JWT access token + refresh-сесії (cookie) в проєкті, а також як має інтегруватись фронтенд.

## Базові принципи

- Аутентифікація через зовнішнього провайдера (Google) відбувається на бекенді.
- Фронтенд не використовує Google SDK для логіну: лише redirect на бекенд.
- `accessToken` — короткоживучий JWT (Bearer), використовується для доступу до захищених API.
- `refresh_token` — довгоживучий токен, використовується для rotation та передається BFF -> backend через `Authorization: Bearer`.
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
    - web flow:
      - повертає `accessToken` + `refreshToken` через redirect на frontend BFF callback (`/api/auth/callback`)
      - frontend BFF встановлює cookie на своєму домені
    - mobile flow:
      - тимчасово відкладено; поточна реалізація сфокусована лише на web cookie flow

### Bootstrap сесії

- `POST /auth/bootstrap`
  - Читає refresh token з `Authorization: Bearer`.
  - Валідує refresh-сесію (існує, не revoked, не expired).
  - Повертає:
    - `accessToken` (новий JWT для API запитів)
    - `user` (`id`, `email`, `name`, `avatarUrl`)
  - Якщо refresh-сесія невалідна, повертає `401`.

### Поточний користувач

- `POST /auth/me`
  - Потребує валідний `accessToken` в `Authorization: Bearer`.
  - Повертає тільки `user` (`id`, `email`, `name`, `avatarUrl`).
  - Не видає новий `accessToken`.

### Оновлення access token (rotation)

- `POST /auth/refresh`
  - Читає поточний refresh token з `Authorization: Bearer`.
  - Виконує rotation refresh токена (старий revoke, новий create).
  - Повертає `accessToken` + `refreshToken`.

### Logout

- `POST /auth/logout`
  - Ревокує поточну refresh-сесію за refresh токеном із `Authorization`.
  - Використовується для logout на поточному девайсі/сесії.

- `POST /auth/logout-all`
  - Потребує валідний `accessToken`.
  - Ревокує всі refresh-сесії поточного користувача.
