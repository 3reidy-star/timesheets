import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/app/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },

  pages: { signIn: "/login" },

  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
    }),
  ],

  callbacks: {
    async signIn({ user, profile }) {
      const email =
        user.email?.toLowerCase().trim() ||
        (profile as any)?.email?.toLowerCase().trim() ||
        (profile as any)?.preferred_username?.toLowerCase().trim();

      if (!email) return false;
      if (!email.endsWith("@pfgbltd.com")) return false;

      const dbUser = await prisma.user.findUnique({
        where: { email },
      });

      return !!dbUser;
    },

    async jwt({ token }) {
      const email = token.email?.toLowerCase().trim();

      if (email) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            role: true,
            name: true,
            email: true,
          },
        });

        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.email = dbUser.email;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        session.user.name = token.name;
        session.user.email = token.email ?? session.user.email;
      }

      return session;
    },
  },
});