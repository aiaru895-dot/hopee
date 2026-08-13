export type Role = 'elder' | 'volunteer';
export type VolunteerStatus = 'offline' | 'online' | 'searching' | 'busy' | 'blocked';
export type HelpCategory = 'phone' | 'messengers' | 'internet' | 'settings' | 'apps' | 'payments' | 'talk' | 'any';
export type HelpSessionStatus = 'waiting' | 'matched' | 'active' | 'completed' | 'cancelled' | 'reported';
export type MessageType = 'text' | 'voice' | 'photo' | 'video' | 'system';
export type VolunteerTrustLevel = 'NEW' | 'BASIC' | 'VERIFIED' | 'TRUSTED' | 'SUSPENDED' | 'BANNED';
export type ReportSeverity = 'normal' | 'high';
export type ReportReason =
  | 'trolling'
  | 'money'
  | 'password'
  | 'bank_data'
  | 'suspicious_app'
  | 'suspicious_content'
  | 'bad_behavior'
  | 'other';

export type User = {
  id: string;
  role: Role;
  name: string;
  age: number;
  city: string;
  avatar: string;
  email?: string;
  phone?: string;
  createdAt: string;
  status: VolunteerStatus;
};

export type VolunteerProfile = {
  userId: string;
  verified: boolean;
  skills: HelpCategory[];
  rating: number;
  ratingCount: number;
  xp: number;
  level: number;
  title: string;
  successfulHelpCount: number;
  peopleHelped: number;
  thanksReceived: number;
  trustScore: number;
  riskScore: number;
  trustLevel: VolunteerTrustLevel;
  reportsCount: number;
  seriousReportsCount: number;
  blockedCount: number;
  online: boolean;
  busy: boolean;
};

export type Volunteer = User & { profile: VolunteerProfile };

export type MatchRequest = {
  id: string;
  elderUserId: string;
  helpCategory: HelpCategory;
  status: 'created' | 'matched' | 'accepted' | 'closed' | 'failed';
  createdAt: string;
  matchedVolunteerId?: string;
};

export type HelpSession = {
  id: string;
  helpRequestId: string;
  elderUserId: string;
  volunteerId: string;
  status: HelpSessionStatus;
  startedAt: string;
  endedAt?: string;
};

export type ChatMessage = {
  id: string;
  sessionId: string;
  senderId: string;
  messageType: MessageType;
  text: string;
  createdAt: string;
  fileUrl?: string;
  fileName?: string;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: number;
};

export type SafetyReport = {
  id: string;
  sessionId?: string;
  reporterId: string;
  reportedUserId: string;
  reason: ReportReason;
  severity: ReportSeverity;
  comment: string;
  createdAt: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
};
