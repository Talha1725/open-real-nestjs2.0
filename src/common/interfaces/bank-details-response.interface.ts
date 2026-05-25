export interface BankDetailsResponse {
  id: string;
  accountHolderName: string;
  iban: string | null;
  accountNumber: string | null;
  bankName: string;
  swiftBic: string | null;
  sortCode: string | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}
