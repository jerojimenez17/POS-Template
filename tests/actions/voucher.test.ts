import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVoucherNumberAction } from '@/actions/voucher';
import { auth } from '../../auth';
import { db } from '@/lib/db';
import { UserRole } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    business: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../auth', () => ({
  auth: vi.fn(),
}));

global.fetch = vi.fn();

describe('getVoucherNumberAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_AFIP_API_KEY = "test-key";
  });

  it('debe devolver error si el usuario no tiene sesion', async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const result = await getVoucherNumberAction(1, 11);
    expect(result.error).toBe('No autorizado');
  });

  it('debe devolver el proximo comprobante correctamente', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '1', role: UserRole.ADMIN, businessId: 'b1' },
      expires: '1',
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { lastVoucher: 150 } }),
    } as any);

    vi.mocked(db.business.findUnique).mockResolvedValue({
      cuit: '20123456789',
      cert: 'cert',
      key: 'key',
    } as any);

    const result = await getVoucherNumberAction(1, 11);

    expect(result.success).toBe(150);
    expect(result.error).toBeUndefined();
    expect(global.fetch).toHaveBeenCalled();
  });

  it('debe manejar errores de la cloud function', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '1', role: UserRole.ADMIN, businessId: 'b1' },
      expires: '1',
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
    } as any);

    vi.mocked(db.business.findUnique).mockResolvedValue({
      cuit: '20123456789',
      cert: 'cert',
      key: 'key',
    } as any);

    const result = await getVoucherNumberAction(1, 11);

    expect(result.error).toBe('Error al obtener comprobante');
    expect(result.success).toBeUndefined();
  });
});
