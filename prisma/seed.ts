import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      name: "Craig Reid",
      email: "craig@pfgbltd.com",
      role: "ADMIN",
    },
    {
      name: "Vadim Batranac",
      email: "vadim@pfgbltd.com",
      role: "ENGINEER",
    },
    {
      name: "Kostiantyn Serohin",
      email: "kostiantyn@pfgbltd.com",
      role: "ENGINEER",
    },
    {
      name: "Dan Giles",
      email: "dan@pfgbltd.com",
      role: "ENGINEER",
    },
    {
      name: "Deanna Smith",
      email: "deanna@pfgbltd.com",
      role: "ACCOUNTS",
    },
  ] as const;

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
      },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
      },
    });

    console.log(`Seeded: ${u.email} (${u.role})`);
  }

  console.log("Seeding complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });