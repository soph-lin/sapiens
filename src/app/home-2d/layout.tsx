export default function Home2dLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="home-2d-screen h-dvh overflow-hidden">{children}</div>;
}
