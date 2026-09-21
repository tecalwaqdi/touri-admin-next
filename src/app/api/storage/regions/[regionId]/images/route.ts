import { handleGeographyImageWritePost } from "@/infrastructure/http/geographyImageWriteRoute";

/** POST — replace/archive Legacy region img (cities collection) via WIF Storage + Firestore. */
export async function POST(
  request: Request,
  context: { params: Promise<{ regionId: string }> },
) {
  const { regionId } = await context.params;
  return handleGeographyImageWritePost({
    request,
    kind: "region_image",
    ownerId: regionId,
    defaultAction: "replace_region_image",
  });
}
