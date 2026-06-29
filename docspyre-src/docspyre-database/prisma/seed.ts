/**
 * Idempotent development seed.
 *
 * Creates a single default workspace owner so the app is usable immediately
 * after `migrate:dev`. Safe to run repeatedly (uses upsert). Never run against
 * production with these credentials.
 */
import { PrismaClient, UserStatus, WorkspaceRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Must match BCRYPT_SALT_ROUNDS used by the backend auth utility.
const SALT_ROUNDS = 12;

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@docspyre.local';
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function main(): Promise<void> {
  const emailNormalized = SEED_EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  const user = await prisma.user.upsert({
    where: { emailNormalized },
    update: {},
    create: {
      email: SEED_EMAIL,
      emailNormalized,
      passwordHash,
      firstName: 'Docspyre',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'docspyre-hq' },
    update: {},
    create: {
      name: 'Docspyre HQ',
      slug: 'docspyre-hq',
      ownerId: user.id,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: WorkspaceRole.OWNER },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
    },
  });

  console.log(`Seed complete. Admin login: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
