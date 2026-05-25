export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
