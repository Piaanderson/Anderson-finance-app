import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { prisma } from "@/server/db";

const providers = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  );
}

if (
  process.env.NODE_ENV !== "production" &&
  process.env.AUTH_DEV_BYPASS === "true"
) {
  providers.push(
    Credentials({
      id: "development",
      name: "Local development",
      credentials: {
        email: { label: "Email", type: "email" }
      },
      authorize: async (credentials) => {
        const { email } = z.object({ email: z.email() }).parse(credentials);
        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: { email, name: "Local user" }
        });
        const membership = await prisma.householdMember.findFirst({
          where: { userId: user.id }
        });
        if (!membership) {
          await prisma.household.create({
            data: {
              name: "My household",
              members: {
                create: { userId: user.id, role: "OWNER" }
              }
            }
          });
        }
        return user;
      }
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
    authorized({ auth: session }) {
      return Boolean(session?.user);
    }
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await prisma.household.create({
        data: {
          name: user.name ? `${user.name}'s household` : "My household",
          members: {
            create: { userId: user.id, role: "OWNER" }
          }
        }
      });
    }
  },
  trustHost: true
});
