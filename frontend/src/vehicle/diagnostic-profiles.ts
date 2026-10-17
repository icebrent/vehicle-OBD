export interface DiagnosticProfile {
  id: string;
  name: string;
  definition_version: string;
  request_id: string;
  response_id: string;
  experimental: boolean;
}
export function hasVehicleDecoder(profile: DiagnosticProfile): boolean {
  return profile.definition_version === "dolphin-community-v1";
}
