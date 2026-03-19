import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },

  pages: { signIn: "/login" },

  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
    }),
  ],

  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = (user as any).id;
        (session.user as any).role = (user as any).role;
      }
      return session;
    },
  },

  events: {
    async createUser({ user }) {
      // Ensure new SSO users get a default role
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "ENGINEER" },
      });
    },
  },
});
