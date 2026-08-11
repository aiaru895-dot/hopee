export type Role = 'elder' | 'volunteer';
export type VolunteerStatus = 'offline' | 'online' | 'searching' | 'busy' | 'blocked';
export type HelpCategory = 'phone' | 'messengers' | 'internet' | 'settings' | 'apps' | 'payments' | 'talk' | 'any';

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
  successfulCalls: number;
  peopleHelped: number;
  thanksReceived: number;
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

export type CallSession = {
  id: string;
  elderUserId: string;
  volunteerId: string;
  startedAt: string;
  endedAt?: string;
  screenShareEnabled: boolean;
  status: 'active' | 'ended';
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: number;
};
