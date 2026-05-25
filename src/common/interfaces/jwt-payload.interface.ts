export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: string; // UserRole
  tenantId: string;
  jti: string; // unique token ID for blacklisting
}
