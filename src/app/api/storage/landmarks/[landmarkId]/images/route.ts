import { handleGeographyImageWritePost } from "@/infrastructure/http/geographyImageWriteRoute";

export async function POST(
  request: Request,
  context: { params: Promise<{ landmarkId: string }> },
) {
  const { landmarkId } = await context.params;
  return handleGeographyImageWritePost({
    request,
    kind: "landmark_image",
    ownerId: landmarkId,
    defaultAction: "replace_landmark_image",
  });
}
