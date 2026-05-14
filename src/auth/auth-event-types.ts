/** Stored in AuthEvent.type — keep values stable for dashboards and alerts. */
export const AUTH_EVENT_TYPE = {
  LOGIN_SUCCESS: 'login_success',
  REFRESH: 'refresh',
  REFRESH_FAIL: 'refresh_fail',
  REUSE_DETECTED: 'reuse_detected',
  LOGOUT: 'logout',
  LOGOUT_ALL: 'logout_all',
} as const;
