import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/server/db";
import {
  consumeRecoveryCode,
  verifyPasskeyAssertion
} from "@/server/passkeys/service";
import {
  passkeyAssertionEnvelopeSchema,
  recoveryCredentialSchema
} from "@/server/passkeys/validation";
import {
  clearThrottle,
  requestThrottleKey,
  takeThrottle
} from "@/server/passkeys/throttle";

const providers = [
  Credentials({
    id: "passkey",
    name: "Passkey",
    credentials: {
      ceremonyId: { label: "Ceremony", type: "text" },
      response: { label: "Passkey response", type: "text" }
    },
    authorize: async (credentials, request) => {
      const throttleKey = requestThrottleKey(request);
      const throttle = await takeThrottle("AUTH_VERIFY", throttleKey);
      if (!throttle.allowed) return null;

      try {
        const input = passkeyAssertionEnvelopeSchema.parse(credentials);
        const user = await verifyPasskeyAssertion(
          input.ceremonyId,
          input.response
        );
        await clearThrottle("AUTH_VERIFY", throttleKey);
        return user;
      } catch {
        return null;
      }
    }
  }),
  Credentials({
    id: "recovery-code",
    name: "Recovery code",
    credentials: {
      code: { label: "Recovery code", type: "password" }
    },
    authorize: async (credentials, request) => {
      const throttleKey = requestThrottleKey(request);
      const throttle = await takeThrottle("RECOVERY_VERIFY", throttleKey);
      if (!throttle.allowed) return null;

      try {
        const { code } = recoveryCredentialSchema.parse(credentials);
        const user = await consumeRecoveryCode(code);
        await clearThrottle("RECOVERY_VERIFY", throttleKey);
        return user;
      } catch {
        return null;
      }
    }
  })
];

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
  trustHost: true
});
