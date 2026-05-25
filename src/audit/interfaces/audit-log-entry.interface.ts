export interface AuditLogEntry {
  tenantId?: string | null;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, any>;
  ipAddress?: string;
}
