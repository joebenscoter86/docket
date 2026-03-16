interface ExtractionFormProps {
  extractedData: {
    id: string;
    confidence_score: "high" | "medium" | "low";
    [key: string]: unknown;
    extracted_line_items: Array<{
      id: string;
      [key: string]: unknown;
    }>;
  };
}

export default function ExtractionForm({ extractedData }: ExtractionFormProps) {
  return (
    <div className="flex h-full items-center justify-center bg-gray-50 text-sm text-gray-400">
      <div className="text-center">
        <p className="text-2xl mb-2">📝</p>
        <p>Extraction Form — DOC-21</p>
        <p className="text-xs mt-1">
          {extractedData.extracted_line_items.length} line items
        </p>
      </div>
    </div>
  );
}
