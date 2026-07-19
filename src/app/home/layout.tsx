import { AppNavbar } from "@/app/components/nav";

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="home-screen flex h-dvh flex-col overflow-hidden bg-white">
      <AppNavbar theme="light" />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
