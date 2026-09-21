import { handleGeographyImageWritePost } from "@/infrastructure/http/geographyImageWriteRoute";

/** POST — replace/archive Legacy countries.img via WIF Storage + Firestore. */
export async function POST(
  request: Request,
  context: { params: Promise<{ countryId: string }> },
) {
  const { countryId } = await context.params;
  return handleGeographyImageWritePost({
    request,
    kind: "country_image",
    ownerId: countryId,
    defaultAction: "replace_country_image",
  });
}
