import type { MerchantProfileDto, MerchantProfileInput, MerchantWorkspaceDto } from "./merchant";

export type RegisterWithInviteRequest = {
  email: string;
  password: string;
  inviteCode: string;
  merchantProfile: MerchantProfileInput;
};

export type RegisterWithInviteResponse = {
  userId: string;
  merchantProfile: MerchantProfileDto;
  sessionEstablished: boolean;
};

export type MemberLoginRequest = {
  username: string;
  password: string;
  next?: string | null;
};

export type MemberRegisterWithInviteRequest = {
  inviteCode: string;
  displayName?: string | null;
  username: string;
  password: string;
};

export type MemberAuthResponse = {
  userId: string;
  workspaces: MerchantWorkspaceDto[];
  nextPath: string;
  sessionEstablished: boolean;
};
