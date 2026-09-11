import type { AccessRole, Sharing } from "@/lib/sharing";
import type { ResourceType } from "@/client/actions/sharing";

export const sharingRoleOptions = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
  { value: "full_access", label: "Full access" },
];

export const sharingRoleLabel = (role: string) =>
  sharingRoleOptions.find((option) => option.value === role)?.label ?? role;

export const isSharingRole = (value: string): value is AccessRole =>
  value === "view" || value === "edit" || value === "full_access";

export function linkAccessDescription(
  type: ResourceType,
  data: Pick<Sharing, "visibility" | "inheritedPublic">,
) {
  if (data.visibility === "public")
    return type === "project"
      ? "Anyone with the public link can read this project and its documents without signing in."
      : "Anyone with the public link can read this document without signing in. Publishing a document does not publish its project.";

  if (data.inheritedPublic)
    return "This document is publicly readable because its project is public. Make the project private to restrict access.";

  return type === "document"
    ? "People added to this document or its project can read it."
    : "Only people added to this project can read it. Documents can be shared separately.";
}
