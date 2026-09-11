import type { publicDocumentAddressSchema } from "./model";

export function publicDocumentPath(address: typeof publicDocumentAddressSchema.Type) {
  return `/${address.username}/d/${address.slug}-${address.identifier}`;
}
