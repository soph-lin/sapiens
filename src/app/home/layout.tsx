import { AppNavbar } from "@/app/components/nav";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="home-screen flex h-dvh w-full max-w-full flex-col overflow-hidden bg-[#071014]">
      <AppNavbar theme="space" />
      <div className="min-h-0 w-full flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
