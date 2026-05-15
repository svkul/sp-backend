# Конфігурація

## Мета

Цей документ фіксує правила роботи з конфігурацією та **актуальний** набір змінних оточення й namespace-ів Nest (`ConfigService`).

## Базові принципи

- Конфігурація централізована в **`src/config/configuration.ts`**.
- Усі перелічені в схемі **Zod** змінні валідуються на старті; помилка валідації зупиняє bootstrap.
- У коді застосунку доступ через **`ConfigService`** і ключі виду **`app.*`**, **`auth.*`**, **`oauth.*`**, **`web.*`** (відповідають `registerAs` у `configuration.ts`).
- Пряме **`process.env`** у сервісах/контролерах не використовується (окрім **`PrismaService`**, який читає **`DATABASE_URL`** для адаптера — це виняток на рівні інфраструктури БД).

## Обов'язковий workflow для нової змінної

1. Додати змінну в **`.env.example`** з коротким коментарем.
2. Додати поле в **`validationSchema`** (`z.object({ ... })` у `configuration.ts`).
3. Дефолти Zod — лише для безпечних очікуваних значень (не для секретів).
4. Протащити значення в відповідний **`registerAs('namespace', ...)`**.
5. Читати через **`configService.get(...)`** / **`getOrThrow(...)`** з правильним ключем.
6. Оновити цей файл (`docs/config.md`) і за потреби **`docs/auth.md`**.

## Правила структурування конфігів

- Групи: **`app`**, **`auth`**, **`oauth`**, **`web`**.
- Env-імена — **SCREAMING_SNAKE_CASE**; поля в namespace — **`camelCase`**.

---

## Актуальна схема оточення (Zod)

Файл: **`src/config/configuration.ts`**, об'єкт **`validationSchema`**.

| Змінна оточення                  | Обов'язковість | Примітка                                                                                                                      |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **`PORT`**                       | опційно        | `1..65535`, за замовчуванням **`3000`**.                                                                                      |
| **`NODE_ENV`**                   | так            | `development` \| `production` \| `test`.                                                                                      |
| **`DATABASE_URL`**               | так            | Рядок підключення Postgres (не валідація URL, мінімум непустий).                                                              |
| **`JWT_ACCESS_SECRET`**          | так            | Секрет підпису access JWT.                                                                                                    |
| **`JWT_ISSUER`**                 | так            | Claim **`iss`** (підпис і `JwtStrategy` мають збігатися).                                                                     |
| **`JWT_AUDIENCE`**               | так            | Claim **`aud`**.                                                                                                              |
| **`JWT_ACCESS_TTL`**             | опційно        | Рядок тривалості (на кшталт **`15m`**, **`1h`**); за замовчуванням **`1m`**. Також задає **`maxAge`** access-cookie.          |
| **`REFRESH_TOKEN_TTL_WEB`**      | опційно        | Sliding refresh для **`Session.client = web`**; дефолт **`14d`**.                                                             |
| **`REFRESH_TOKEN_TTL_MOBILE`**   | опційно        | Для **`ios`** / **`android`**; дефолт **`90d`**.                                                                              |
| **`REFRESH_TOKEN_ABSOLUTE_MAX`** | опційно        | «Стеля» ланцюга **`absoluteExpiresAt`**; дефолт **`180d`**.                                                                   |
| **`COOKIE_SECRET`**              | так            | Секрет для **`cookie-parser`** (підписані cookies можливі в майбутньому).                                                     |
| **`GOOGLE_CLIENT_ID`**           | так            | OAuth Google (web callback flow).                                                                                             |
| **`GOOGLE_CLIENT_SECRET`**       | так            |                                                                                                                               |
| **`GOOGLE_CALLBACK_URL`**        | так            | Валідний URL (redirect URI у Google Cloud).                                                                                   |
| **`FRONTEND_URL`**               | так            | Канонічний URL веб-застосунку; редірект після OAuth: **`/auth/callback`**.                                                    |
| **`CORS_URL`**                   | опційно        | Додаткові browser origins через **кому**; **`FRONTEND_URL`** завжди у списку CORS. Порожній рядок за замовчуванням.           |
| **`COOKIE_DOMAIN`**              | опційно        | Підмножина **`Domain`** для auth-cookies (наприклад **`.example.com`**). Порожньо на localhost / без спільного parent-домену. |

Повний приклад імен див. **`.env.example`** у корені `backend/`.

---

## Namespace `app` (`registerAs('app', ...)`)

| Ключ `ConfigService` | Джерело    | Опис               |
| -------------------- | ---------- | ------------------ |
| **`app.PORT`**       | `PORT`     | Порт HTTP сервера. |
| **`app.NODE_ENV`**   | `NODE_ENV` | Режим застосунку.  |

---

## Namespace `auth` (`registerAs('auth', ...)`)

| Ключ `ConfigService`                 | Джерело / похідне            | Опис                                                       |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------- |
| **`auth.jwtAccessSecret`**           | `JWT_ACCESS_SECRET`          | Підпис access JWT.                                         |
| **`auth.cookieSecret`**              | `COOKIE_SECRET`              | Секрет cookie-parser.                                      |
| **`auth.jwtIssuer`**                 | `JWT_ISSUER`                 | `iss` у JWT.                                               |
| **`auth.jwtAudience`**               | `JWT_AUDIENCE`               | `aud` у JWT.                                               |
| **`auth.accessTtl`**                 | `JWT_ACCESS_TTL`             | Рядок TTL для `JwtModule` / `sign`.                        |
| **`auth.accessTokenCookieMaxAgeMs`** | обчислено з `JWT_ACCESS_TTL` | `parseDurationMs` — для **`maxAge`** cookie `accessToken`. |
| **`auth.refreshTokenTtlWeb`**        | `REFRESH_TOKEN_TTL_WEB`      | Рядок TTL (web).                                           |
| **`auth.refreshTokenTtlMobile`**     | `REFRESH_TOKEN_TTL_MOBILE`   | Рядок TTL (mobile client).                                 |
| **`auth.refreshTokenAbsoluteMax`**   | `REFRESH_TOKEN_ABSOLUTE_MAX` | Рядок absolute cap.                                        |
| **`auth.refreshTokenTtlWebMs`**      | обчислено                    | Мілісекунди для сесій / cookie refresh (web).              |
| **`auth.refreshTokenTtlMobileMs`**   | обчислено                    | Мілісекунди для mobile client.                             |
| **`auth.refreshTokenAbsoluteMaxMs`** | обчислено                    | Мілісекунди для cap ланцюга refresh.                       |

Допоміжна логіка тривалостей: **`src/utils/parse-duration.ts`**.

---

## Namespace `oauth` (`registerAs('oauth', ...)`)

| Ключ `ConfigService`           | Джерело                | Опис                                       |
| ------------------------------ | ---------------------- | ------------------------------------------ |
| **`oauth.googleClientId`**     | `GOOGLE_CLIENT_ID`     |                                            |
| **`oauth.googleClientSecret`** | `GOOGLE_CLIENT_SECRET` |                                            |
| **`oauth.googleCallbackUrl`**  | `GOOGLE_CALLBACK_URL`  | Callback URL для Passport Google strategy. |

---

## Namespace `web` (`registerAs('web', ...)`)

| Ключ `ConfigService`  | Джерело / похідне                        | Опис                                                                      |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| **`web.frontendUrl`** | `FRONTEND_URL`                           | База для редіректу після OAuth.                                           |
| **`web.corsOrigins`** | `FRONTEND_URL` + розбитий **`CORS_URL`** | Масив унікальних URL для **`enableCors({ origin, credentials: true })`**. |

---

## Правила валідації (загальні)

- Секрети без небезпечних дефолтів у коді.
- URL-поля (`FRONTEND_URL`, `GOOGLE_CALLBACK_URL`, кожен сегмент `CORS_URL`) перевіряються як URL.
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
- Значення потрапило в потрібний **`registerAs`**.
- Код використовує **`ConfigService`**, без прямого **`process.env`** (крім узгоджених винятків інфраструктури).
- Документація оновлена, якщо змінено контракт конфігу або auth.
