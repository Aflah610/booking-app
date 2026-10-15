import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { app } from "@/features/container";
import { adminEmails } from "@/lib/env";

// Staff sign in with their Google accounts. Only people in the staff table (or listed in
// ADMIN_EMAILS for the very first login) get in. Reads AUTH_SECRET, AUTH_GOOGLE_ID and
// AUTH_GOOGLE_SECRET from the environment.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // The app always runs behind a host's proxy (AppSail, App Runner, a load balancer), which sets the Host header.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email;
      if (!email || profile?.email_verified === false) return false;
      const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
      if (domain && !email.toLowerCase().endsWith(`@${domain}`)) return false;
      const member = await app().staff.resolveLogin({ email, name: profile?.name }, adminEmails());
      return Boolean(member);
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        const member = await app().staff.resolveLogin({ email: profile.email, name: profile.name }, adminEmails());
        if (member) token.staffId = member.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.staffId === "string") session.user.staffId = token.staffId;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: { staffId?: string; name?: string | null; email?: string | null; image?: string | null };
  }
}
