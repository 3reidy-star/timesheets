import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/app/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    async signIn({ profile }) {
      const email = (
        (profile as any)?.email ||
        (profile as any)?.preferred_username ||
        (profile as any)?.upn ||
        ""
      ).toLowerCase();

      if (!email.endsWith("@pfgbltd.com")) {
        return false;
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: { active: true },
      });

      if (user && !user.active) {
        return false;
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).id;
      }

      return session;
    },
  },
});