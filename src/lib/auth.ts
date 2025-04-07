import { AuthOptions } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

interface DiscordProfile {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
}

export const authOptions: AuthOptions = {
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: "identify email"
        }
      },
      profile(profile: DiscordProfile) {
        return {
          id: profile.id,
          name: profile.username,
          email: profile.email,
          image: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
          coins: 1000,
        };
      },
    }),
    CredentialsProvider({
      id: "credentials",
      name: "Guest",
      credentials: {
        name: { label: "Name", type: "text" },
        type: { label: "Type", type: "text" }
      },
      async authorize(credentials) {
        if (!credentials?.name || credentials.type !== "guest") {
          return null;
        }

        // Create a guest user in the database
        const user = await prisma.user.create({
          data: {
            id: `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: credentials.name,
            coins: 1000,
          },
        });

        return {
          id: user.id,
          name: user.name,
          isGuest: true,
          coins: user.coins,
          email: null,
          image: null
        };
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Skip database operations for test users
        if (user.id?.startsWith('test_')) {
          return true;
        }

        // For Discord users, ensure they exist in the database
        if (account?.provider === "discord" && profile) {
          const discordProfile = profile as DiscordProfile;
          
          // Try to find or create user with Discord ID
          const dbUser = await prisma.user.upsert({
            where: { id: discordProfile.id },
            update: {
              name: discordProfile.username,
              email: discordProfile.email,
              image: user.image,
            },
            create: {
              id: discordProfile.id,
              name: discordProfile.username,
              email: discordProfile.email,
              image: user.image,
              coins: 1000,
            },
          });
          
          user.id = discordProfile.id;
          user.coins = dbUser.coins;
        }
        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.isGuest = user.isGuest;
        token.coins = user.coins;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.isGuest = token.isGuest as boolean;
        session.user.coins = token.coins as number;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 12 * 60 * 60 // Only update session every 12 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production' ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  debug: false
}; 