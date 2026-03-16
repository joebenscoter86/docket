import UploadZone from "@/components/invoices/UploadZone";

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-primary">Upload Invoice</h1>
      <div className="mt-6">
        <UploadZone />
      </div>
    </div>
  );
}
