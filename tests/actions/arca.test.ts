import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateBusinessArcaData } from '@/actions/arca';
import { db } from '@/lib/db';
import { auth } from '../../auth';
import { UserRole } from '@prisma/client';

// Mock dependencias
vi.mock('@/lib/db', () => ({
  db: {
    business: {
      update: vi.fn(),
    },
  },
}));

vi.mock('../../../auth', () => ({
  auth: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('updateBusinessArcaData Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debería permitir guardar un arreglo de ptoVenta para SUPER_ADMIN', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '1', role: UserRole.SUPER_ADMIN, businessId: 'b1' },
      expires: '1',
    });

    const inputData = {
      cuit: '20123456789',
      razonSocial: 'Test S.A.',
      inicioActividades: new Date(),
      condicionIva: 'MONOTRIBUTO' as const,
      ptoVenta: [1, 2, 3],
    };

    vi.mocked(db.business.update).mockResolvedValue({} as any);

    const result = await updateBusinessArcaData('b1', inputData);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe('Datos de ARCA actualizados');
    expect(db.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1' },
        data: expect.objectContaining({
          ptoVenta: [1, 2, 3],
        }),
      })
    );
  });

  it('debería permitir a un ADMIN modificar su propio negocio y guardar ptoVenta', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '2', role: UserRole.ADMIN, businessId: 'b1' },
      expires: '1',
    });

    const inputData = {
      cuit: '20123456789',
      razonSocial: 'Admin Business S.A.',
      inicioActividades: new Date(),
      condicionIva: 'MONOTRIBUTO' as const,
      ptoVenta: [5],
    };

    vi.mocked(db.business.update).mockResolvedValue({} as any);

    const result = await updateBusinessArcaData('b1', inputData);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe('Datos de ARCA actualizados');
  });

  it('NO debería permitir a un ADMIN modificar el negocio de otro', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: '2', role: UserRole.ADMIN, businessId: 'b1' },
      expires: '1',
    });

    const inputData = {
      cuit: '20123456789',
      razonSocial: 'Other Business S.A.',
      inicioActividades: new Date(),
      condicionIva: 'MONOTRIBUTO' as const,
      ptoVenta: [1],
    };

    // Intentar modificar un businessId distinto
    const result = await updateBusinessArcaData('b2', inputData);

    expect(result.error).toBe('No autorizado para modificar otro negocio');
    expect(db.business.update).not.toHaveBeenCalled();
  });
});
