import VoyageClient from "./VoyageClient";

export default async function VoyagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <VoyageClient slug={slug} />;
}
