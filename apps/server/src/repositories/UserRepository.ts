import { PrismaClient, Prisma, User } from '@prisma/client';

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * @param id User UUID
   * @returns User or null
   */
  findById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  /**
   * @param email normalized email
   * @returns User or null
   */
  findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  /**
   * @param data Prisma.UserCreateInput
   * @returns created User
   */
  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.db.user.create({ data });
  }
}
