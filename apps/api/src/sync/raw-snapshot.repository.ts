import type { PrismaService } from '../db/prisma.service.js';
import { decryptBytes, encryptBytes } from './raw-snapshot.crypto.js';

export type StoreRawSnapshotInput = {
  syncRunId: string;
  restaurantId: string;
  endpoint: string;
  page: number;
  contentType: string;
  body: Buffer;
};

export class RawSnapshotRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly key: Buffer,
  ) {}

  async store(input: StoreRawSnapshotInput) {
    const encrypted = encryptBytes(input.body, this.key);
    return this.prisma.rawSnapshot.create({
      data: {
        syncRunId: input.syncRunId,
        restaurantId: input.restaurantId,
        endpoint: input.endpoint,
        page: input.page,
        contentType: input.contentType,
        ...encrypted,
      },
    });
  }

  async readBody(id: string): Promise<Buffer> {
    const snapshot = await this.prisma.rawSnapshot.findUniqueOrThrow({ where: { id } });
    return decryptBytes(
      {
        algorithmVersion: snapshot.algorithmVersion as 1,
        ciphertext: Buffer.from(snapshot.ciphertext),
        iv: Buffer.from(snapshot.iv),
        authTag: Buffer.from(snapshot.authTag),
      },
      this.key,
    );
  }
}
