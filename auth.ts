import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "database",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      const existing = await prisma.user.findUnique({
        where: { email },
      });

      return !!existing;
    },

    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;

        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });

        if (dbUser) {
          session.user.name = dbUser.name;
          session.user.email = dbUser.email;
          (session.user as any).role = dbUser.role;
        }
      }

      return session;
    },
  },
});