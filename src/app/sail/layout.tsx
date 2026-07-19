import { AppNavbar } from "@/app/components/nav";

export default function SailLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="sail-screen flex min-h-dvh w-full max-w-full flex-col bg-white">
      <AppNavbar theme="light" />
      <div className="min-h-0 w-full flex-1 bg-white">{children}</div>
    </div>
  );
}
