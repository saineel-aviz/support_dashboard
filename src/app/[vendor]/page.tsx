import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getVendor, isVendorSlug } from "@/config/vendors";

export default async function VendorPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor: slug } = await params;
  if (!isVendorSlug(slug)) notFound();
  const vendor = getVendor(slug);
  if (!vendor) notFound();
  return <DashboardClient vendor={vendor} />;
}
