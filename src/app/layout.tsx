import type { Metadata } from "next";
import { Manrope, Playfair_Display, Space_Mono } from "next/font/google";
import { UserProvider } from "@/app/components/user/UserProvider";
import { getCurrentDemoUser } from "@/lib/demo-auth";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: "400",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "sapiens",
  description:
    "Educational exploration — learn by entering interactive worlds.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentDemoUser();

  return (
    <html
      lang="en"
      className={`${playfairDisplay.variable} ${manrope.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-[#f4f1ea]">
        <UserProvider initialUser={user}>{children}</UserProvider>
      </body>
    </html>
  );
}
