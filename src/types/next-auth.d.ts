import NextAuth, { DefaultSession } from "next-auth";
import { User } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      coins: number;
      isGuest?: boolean;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    coins: number;
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    isGuest?: boolean;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser extends User {
    coins: number;
  }
} 