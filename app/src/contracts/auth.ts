import type { MerchantProfileDto, MerchantProfileInput } from "./merchant";

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
