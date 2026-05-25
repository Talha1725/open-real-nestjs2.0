import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateIntegrationsDto } from '../tenant-admin/dto/update-integrations.dto.js';

describe('UpdateIntegrationsDto paymentConfig validation', () => {
  it('accepts a complete payment config', () => {
    const dto = plainToInstance(UpdateIntegrationsDto, {
      paymentConfig: {
        accountName: 'OpenReal Client Account',
        iban: 'GB29NWBK60161331926819',
        bankName: 'National Westminster Bank',
        swift: 'NWBKGB2L',
      },
    });

    expect(validateSync(dto)).toHaveLength(0);
  });

  it.each(['accountName', 'iban', 'bankName', 'swift'])(
    'rejects payment config when %s is missing',
    (missingField) => {
      const paymentConfig = {
        accountName: 'OpenReal Client Account',
        iban: 'GB29NWBK60161331926819',
        bankName: 'National Westminster Bank',
        swift: 'NWBKGB2L',
      };
      delete paymentConfig[missingField as keyof typeof paymentConfig];

      const dto = plainToInstance(UpdateIntegrationsDto, { paymentConfig });

      expect(validateSync(dto)).not.toHaveLength(0);
    },
  );

  it.each(['accountName', 'iban', 'bankName', 'swift'])(
    'rejects payment config when %s is blank',
    (blankField) => {
      const dto = plainToInstance(UpdateIntegrationsDto, {
        paymentConfig: {
          accountName: 'OpenReal Client Account',
          iban: 'GB29NWBK60161331926819',
          bankName: 'National Westminster Bank',
          swift: 'NWBKGB2L',
          [blankField]: '',
        },
      });

      expect(validateSync(dto)).not.toHaveLength(0);
    },
  );
});
