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
      const email = ((user as any)?.email || token.email || "").toLowerCase();

      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            role: true,
            active: true,
          },
        });

        if (dbUser) {
          (token as any).id = dbUser.id;
          (token as any).role = dbUser.role;
          (token as any).active = dbUser.active;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).active = (token as any).active;
      }

      return session;
    },
  },
});