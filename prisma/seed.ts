import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@company.com";

  await prisma.user.upsert({
    where: { email },
    update: {
      name: "Admin",
      role: "ADMIN",
    },
    create: {
      name: "Admin",
      email,
      role: "ADMIN",
    },
  });

  console.log("Seeded admin user:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
