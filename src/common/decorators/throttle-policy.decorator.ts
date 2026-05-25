import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

const AUTH_SENSITIVE_THROTTLE = { default: { limit: 5, ttl: 900_000 } };
const FINANCIAL_STATE_CHANGE_THROTTLE = {
  default: { limit: 10, ttl: 60_000 },
};
const ADMIN_STATE_CHANGE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
const DASHBOARD_READ_THROTTLE = { default: { limit: 300, ttl: 60_000 } };

export function AuthSensitiveThrottle() {
  return applyDecorators(
    Throttle(AUTH_SENSITIVE_THROTTLE),
    ApiResponse({
      status: 429,
      description: 'Rate limited: 5 requests per 15 minutes.',
    }),
  );
}

export function FinancialStateChangeThrottle() {
  return applyDecorators(
    Throttle(FINANCIAL_STATE_CHANGE_THROTTLE),
    ApiResponse({
      status: 429,
      description: 'Rate limited: 10 financial state changes per minute.',
    }),
  );
}

export function AdminStateChangeThrottle() {
  return applyDecorators(
    Throttle(ADMIN_STATE_CHANGE_THROTTLE),
    ApiResponse({
      status: 429,
      description: 'Rate limited: 30 admin state changes per minute.',
    }),
  );
}

export function DashboardReadThrottle() {
  return applyDecorators(
    Throttle(DASHBOARD_READ_THROTTLE),
    ApiResponse({
      status: 429,
      description: 'Rate limited: 300 dashboard reads per minute.',
    }),
  );
}
