export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="home-screen h-dvh overflow-hidden">{children}</div>;
}
