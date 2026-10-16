import NextAuth from "next-auth";
import { app } from "@/features/container";
import { adminEmails } from "@/lib/env";
import { enabledLoginProviders, localLoginEnabled, localLoginProvider } from "@/lib/login-providers";

// Staff sign in with their Google or Zoho accounts, whichever the settings turn on. Only people in the
// staff table (or listed in ADMIN_EMAILS for the very first login) get in.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    ...enabledLoginProviders().map((p) => p.provider),
    ...(localLoginEnabled() ? [localLoginProvider()] : []),
  ],
  // The app always runs behind a host's proxy (AppSail, App Runner, a load balancer), which sets the Host header.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // `user` is the provider profile already mapped to name/email, so this works for Google and Zoho alike.
    async signIn({ user, profile }) {
      const email = user.email;
      if (!email || profile?.email_verified === false) return false;
      const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
      if (domain && !email.toLowerCase().endsWith(`@${domain}`)) return false;
      const member = await app().staff.resolveLogin({ email, name: user.name }, adminEmails());
      return Boolean(member);
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const member = await app().staff.resolveLogin({ email: user.email, name: user.name }, adminEmails());
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
