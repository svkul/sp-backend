# Конфігурація

## Мета

Цей документ фіксує правила роботи з конфігурацією та **актуальний** набір змінних оточення й namespace-ів Nest (`ConfigService`).

## Базові принципи

- Конфігурація централізована в **`src/config/configuration.ts`**.
- Усі перелічені в схемі **Zod** змінні валідуються на старті; помилка валідації зупиняє bootstrap.
- У коді застосунку доступ через **`ConfigService`** і ключі виду **`app.*`**, **`auth.*`**, **`oauth.*`**, **`web.*`**, **`redis.*`**, **`cloudflare.*`** (відповідають `registerAs` у `configuration.ts`).
- У **`AppModule`** підключені всі зазначені конфіги: `load: [appConfig, authConfig, oauthConfig, webConfig, redisConfig, cloudflareConfig]`.
- Пряме **`process.env`** у сервісах/контролерах не використовується (окрім **`PrismaService`**, який читає **`DATABASE_URL`** для адаптера — це виняток на рівні інфраструктури БД).

## Обов'язковий workflow для нової змінної

1. Додати змінну в **`.env.example`** з коротким коментарем.
2. Додати поле в **`validationSchema`** (`z.object({ ... })` у `configuration.ts`).
3. Дефолти Zod — лише для безпечних очікуваних значень (не для секретів).
4. Протащити значення в відповідний **`registerAs('namespace', ...)`**.
5. Якщо потрібно глобально — зареєструвати namespace у **`ConfigModule.forRoot({ load: [...] })`** у `app.module.ts`.
6. Читати через **`configService.get(...)`** / **`getOrThrow(...)`** з правильним ключем.
7. Оновити цей файл (`docs/config.md`) і за потреби **`docs/auth.md`**.

## Правила структурування конфігів

- Групи: **`app`**, **`auth`**, **`oauth`**, **`web`**, **`redis`**, **`cloudflare`**.
- Env-імена — **SCREAMING_SNAKE_CASE**; поля в namespace — **`camelCase`**.

---

## Актуальна схема оточення (Zod)

Файл: **`src/config/configuration.ts`**, об'єкт **`validationSchema`**.

| Змінна оточення                         | Обов'язковість | Примітка                                                                                                                                 |
| --------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **`PORT`**                              | опційно        | `1..65535`, за замовчуванням **`3000`**.                                                                                                 |
| **`NODE_ENV`**                          | так            | `development` \| `production` \| `test`.                                                                                               |
| **`DATABASE_URL`**                      | так            | Рядок підключення Postgres (не валідація URL, мінімум непустий).                                                                        |
| **`JWT_ACCESS_SECRET`**                 | так            | Секрет підпису access JWT (HS256).                                                                                                      |
| **`JWT_ISSUER`**                        | так            | Claim **`iss`** у JWT; має збігатися з перевіркою в **`TokenService`**.                                                                  |
| **`JWT_AUDIENCE`**                      | так            | Claim **`aud`**.                                                                                                                         |
| **`JWT_ACCESS_TTL`**                    | опційно        | Рядок тривалості (наприклад **`15m`**, **`1h`**); за замовчуванням **`1m`**. Задає TTL JWT і **`maxAge`** cookie access (через `parseDurationMs`). |
| **`REFRESH_TOKEN_TTL_WEB`**             | опційно        | Sliding refresh для клієнта **`web`**; дефолт **`14d`**.                                                                                  |
| **`REFRESH_TOKEN_TTL_MOBILE`**          | опційно        | Для **`ios`** / **`android`**; дефолт **`90d`**.                                                                                         |
| **`REFRESH_TOKEN_ABSOLUTE_MAX`**        | опційно        | Верхня межа ланцюга **`absoluteExpiresAt`** від першого логіну; дефолт **`180d`**.                                                      |
| **`COOKIE_SECRET`**                     | так            | Секрет для **`cookie-parser`** (підпис cookie).                                                                                          |
| **`COOKIE_DOMAIN`**                     | опційно        | Атрибут **`Domain`** для auth-cookies (наприклад **`.example.com`**). Порожній рядок → без `Domain` (host-only, зручно для localhost).   |
| **`GOOGLE_CLIENT_ID`**                  | так            | OAuth 2.0 / OIDC Google (web flow через `openid-client`).                                                                                |
| **`GOOGLE_CLIENT_SECRET`**              | так            |                                                                                                                                          |
| **`GOOGLE_CALLBACK_URL`**               | так            | Валідний **absolute** URL — **redirect URI** у Google Cloud Console; у коді це callback **`GET /auth/google/callback`** на хості API.    |
| **`FRONTEND_URL`**                      | так            | Канонічний origin вебзастосунку: база для **`safeReturnTo`** після OAuth, завжди входить у **`web.corsOrigins`**.                         |
| **`CORS_URL`**                          | опційно        | Додаткові browser origins через **кому** (кожен сегмент — повний URL); **`FRONTEND_URL`** завжди у списку CORS. Порожній рядок за замовчуванням. |
| **`REDIS_URL`**                         | так            | Підключення Redis (**URL**): throttler storage, кеш статусу сесії тощо.                                                                   |
| **`CLOUD_FLARE_TURNSTILE_SECRET_KEY`**  | так            | Секретний ключ Turnstile для **`siteverify`** на backend (парується з публічним site key на frontend). Див. **`docs/auth.md`**.           |

Повний перелік імен див. **`.env.example`** у корені `backend/`.

---

## Namespace `app` (`registerAs('app', ...)`)

| Ключ `ConfigService` | Джерело    | Опис               |
| -------------------- | ---------- | ------------------ |
| **`app.PORT`**       | `PORT`     | Порт HTTP сервера. |
| **`app.NODE_ENV`**   | `NODE_ENV` | Режим застосунку.  |

---

## Namespace `auth` (`registerAs('auth', ...)`)

| Ключ `ConfigService`                   | Джерело / похідне               | Опис                                                                    |
| -------------------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| **`auth.jwtAccessSecret`**             | `JWT_ACCESS_SECRET`             | Підпис access JWT.                                                      |
| **`auth.cookieSecret`**                | `COOKIE_SECRET`                 | Секрет cookie-parser.                                                   |
| **`auth.jwtIssuer`**                   | `JWT_ISSUER`                    | `iss` у JWT.                                                            |
| **`auth.jwtAudience`**                 | `JWT_AUDIENCE`                  | `aud` у JWT.                                                            |
| **`auth.accessTtl`**                   | `JWT_ACCESS_TTL`                | Рядок TTL для підпису access JWT.                                       |
| **`auth.accessTokenCookieMaxAgeMs`**   | обчислено з `JWT_ACCESS_TTL`     | `parseDurationMs` — для **`maxAge`** cookie **`__Secure-access`**.       |
| **`auth.refreshTokenTtlWeb`**          | `REFRESH_TOKEN_TTL_WEB`         | Рядок TTL (web).                                                        |
| **`auth.refreshTokenTtlMobile`**      | `REFRESH_TOKEN_TTL_MOBILE`      | Рядок TTL (mobile client).                                              |
| **`auth.refreshTokenAbsoluteMax`**    | `REFRESH_TOKEN_ABSOLUTE_MAX`    | Рядок absolute cap.                                                     |
| **`auth.refreshTokenTtlWebMs`**       | обчислено                       | Мілісекунди для сесій / cookie refresh (web).                           |
| **`auth.refreshTokenTtlMobileMs`**    | обчислено                       | Мілісекунди для mobile client.                                          |
| **`auth.refreshTokenAbsoluteMaxMs`**  | обчислено                       | Мілісекунди для cap ланцюга refresh.                                    |
| **`auth.cookieDomain`**               | `COOKIE_DOMAIN` (trim, порожнє → `undefined`) | Значення для атрибута `Domain` auth-cookies або `undefined`. |

Допоміжна логіка тривалостей: **`src/utils/parse-duration.ts`**.

---

## Namespace `oauth` (`registerAs('oauth', ...)`)

| Ключ `ConfigService`            | Джерело                | Опис                                                                 |
| ------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| **`oauth.googleClientId`**      | `GOOGLE_CLIENT_ID`     | Client ID у Google Cloud.                                            |
| **`oauth.googleClientSecret`**  | `GOOGLE_CLIENT_SECRET` | Client secret.                                                       |
| **`oauth.googleCallbackUrl`**   | `GOOGLE_CALLBACK_URL`  | Зареєстрований redirect URI; має відповідати URL callback у **`GoogleOAuthService`**. |

---

## Namespace `web` (`registerAs('web', ...)`)

| Ключ `ConfigService`    | Джерело / похідне                          | Опис                                                                                                                                 |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **`web.frontendUrl`**   | `FRONTEND_URL`                             | Базовий URL фронту для безпечних редіректів і узгодження з BFF (`NEXT_PUBLIC_APP_URL` має вказувати на той самий логічний застосунок). |
| **`web.corsOrigins`**   | `FRONTEND_URL` + розбитий **`CORS_URL`**   | Масив унікальних origin для **`enableCors({ origin, credentials: true })`** та перевірки **`CsrfGuard`** (Origin / Referer).          |

Розбір **`CORS_URL`**: **`parseCommaSeparatedUrls`** — некоректний сегмент призводить до викидання помилки при старті.

---

## Namespace `redis` (`registerAs('redis', ...)`)

| Ключ `ConfigService` | Джерело      | Опис                                       |
| -------------------- | ------------ | ------------------------------------------ |
| **`redis.url`**      | `REDIS_URL`  | Підключення Redis (наприклад через Railway). |

---

## Namespace `cloudflare` (`registerAs('cloudflare', ...)`)

| Ключ `ConfigService`           | Джерело                               | Опис                                                   |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------ |
| **`cloudflare.turnstileSecret`** | `CLOUD_FLARE_TURNSTILE_SECRET_KEY` | Секрет для перевірки токена Turnstile (`TurnstileService`). |

---

## Правила валідації (загальні)

- Секрети без небезпечних дефолтів у коді.
- URL-поля (`FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, `REDIS_URL`, кожен сегмент `CORS_URL`) перевіряються як URL (де зазначено в Zod).
- Помилка валідації Zod при старті — процес завершується (немає «тихого» fallback).

## Правила використання в коді

- Читати конфіг на вході в модуль/сервіс; не розмазувати магічні рядки ключів.
- Для обов'язкових для логіки значень використовувати **`getOrThrow('namespace.key')`**.

## Do / Don't

### Do

- Додавати змінну в **`.env.example`**, Zod-схему та відповідний **`registerAs`** одночасно.
- Оновлювати **`docs/config.md`** при зміні списку env або namespace.

### Don't

- Не читати секрети з оточення в документації / логах.
- Не дублювати ту саму семантику в кількох namespace без причини.

## Чекліст перед merge

- Нова змінна є в **`.env.example`**.
- Нова змінна є в **`validationSchema`**.
- Значення потрапило в потрібний **`registerAs`** і при потребі в **`ConfigModule.forRoot({ load })`**.
- Код використовує **`ConfigService`**, без прямого **`process.env`** (крім узгоджених винятків інфраструктури).
- Документація оновлена, якщо змінено контракт конфігу або auth.
