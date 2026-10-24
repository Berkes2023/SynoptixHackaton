import { generateSyntheticCsv, SYNTHETIC_DATASET_NAME } from "@/lib/data/synthetic";

export function GET() {
  return new Response(generateSyntheticCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${SYNTHETIC_DATASET_NAME}"`,
      "X-DeepTrace-Data-Type": "synthetic",
    },
  });
}
