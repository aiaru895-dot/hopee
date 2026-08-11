import { achievements, volunteers } from './ryadomData';
import type { CallSession, HelpCategory, MatchRequest, User, Volunteer } from './ryadomTypes';

let liveVolunteers = volunteers.map((volunteer) => structuredClone(volunteer));

export function registerUser(role: User['role'], name: string, age: number, city: string): User {
  return {
    id: crypto.randomUUID(),
    role,
    name,
    age,
    city,
    avatar: name.slice(0, 1).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: role === 'volunteer' ? 'offline' : 'offline',
  };
}

export function createHelpRequest(elderUserId: string, helpCategory: HelpCategory): MatchRequest {
  return { id: crypto.randomUUID(), elderUserId, helpCategory, status: 'created', createdAt: new Date().toISOString() };
}

export function findRandomVolunteer(category: HelpCategory): Volunteer | undefined {
  const available = liveVolunteers.filter((volunteer) => {
    const matchesSkill = category === 'any' || volunteer.profile.skills.includes(category);
    return volunteer.profile.verified && volunteer.profile.online && !volunteer.profile.busy && matchesSkill;
  });
  return available[Math.floor(Math.random() * available.length)];
}

export function acceptHelpRequest(request: MatchRequest, volunteer: Volunteer): MatchRequest {
  setVolunteerBusy(volunteer.id, true);
  return { ...request, status: 'accepted', matchedVolunteerId: volunteer.id };
}

export function startCall(elderUserId: string, volunteerId: string): CallSession {
  setVolunteerBusy(volunteerId, true);
  return {
    id: crypto.randomUUID(),
    elderUserId,
    volunteerId,
    startedAt: new Date().toISOString(),
    screenShareEnabled: false,
    status: 'active',
  };
}

export function endCall(call: CallSession): CallSession {
  setVolunteerBusy(call.volunteerId, false);
  return { ...call, endedAt: new Date().toISOString(), screenShareEnabled: false, status: 'ended' };
}

export function addXP(volunteer: Volunteer, points: number): Volunteer {
  const xp = volunteer.profile.xp + points;
  const level = calculateLevel(xp);
  return { ...volunteer, profile: { ...volunteer.profile, xp, level, peopleHelped: volunteer.profile.peopleHelped + 1 } };
}

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 120) + 1);
}

export function checkAchievements(volunteer: Volunteer) {
  return achievements.filter((item) => volunteer.profile.peopleHelped >= item.requirement);
}

export function setVolunteerOnline(volunteerId: string, online: boolean): Volunteer | undefined {
  liveVolunteers = liveVolunteers.map((volunteer) =>
    volunteer.id === volunteerId
      ? { ...volunteer, status: online ? 'online' : 'offline', profile: { ...volunteer.profile, online, busy: false } }
      : volunteer,
  );
  return liveVolunteers.find((volunteer) => volunteer.id === volunteerId);
}

export function resetMockBackend() {
  liveVolunteers = volunteers.map((volunteer) => structuredClone(volunteer));
}

function setVolunteerBusy(volunteerId: string, busy: boolean) {
  liveVolunteers = liveVolunteers.map((volunteer) =>
    volunteer.id === volunteerId ? { ...volunteer, status: busy ? 'busy' : 'online', profile: { ...volunteer.profile, busy } } : volunteer,
  );
}
