import { handleGeographyImageWritePost } from "@/infrastructure/http/geographyImageWriteRoute";

export async function POST(
  request: Request,
  context: { params: Promise<{ cityId: string }> },
) {
  const { cityId } = await context.params;
  return handleGeographyImageWritePost({
    request,
    kind: "city_image",
    ownerId: cityId,
    defaultAction: "replace_city_image",
  });
}
