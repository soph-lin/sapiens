import SteerClient from "../SteerClient";

export default async function SteerRunPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SteerClient key={slug} runSlug={slug} />;
}
