export type AuthenticatedUser = {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};
