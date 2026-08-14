import { achievements, starterMessages, volunteers } from './ryadomData';
import type { ChatMessage, HelpCategory, HelpSession, MatchRequest, ReportReason, SafetyReport, User, Volunteer } from './ryadomTypes';

let liveVolunteers = volunteers.map((volunteer) => structuredClone(volunteer));
let safetyReports: SafetyReport[] = [];
let blockedPairs: Array<{ blockerId: string; blockedUserId: string }> = [];

export function registerUser(role: User['role'], name: string, age: number, city: string): User {
  return {
    id: crypto.randomUUID(),
    role,
    name,
    age,
    city,
    avatar: name.slice(0, 1).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'offline',
  };
}

export function createHelpRequest(elderUserId: string, helpCategory: HelpCategory): MatchRequest {
  return { id: crypto.randomUUID(), elderUserId, helpCategory, status: 'created', createdAt: new Date().toISOString() };
}

export function findRandomVolunteer(category: HelpCategory, elderUserId?: string): Volunteer | undefined {
  const available = liveVolunteers.filter((volunteer) => {
    const matchesSkill = category === 'any' || volunteer.profile.skills.includes(category);
    const isBlocked = elderUserId ? blockedPairs.some((item) => item.blockerId === elderUserId && item.blockedUserId === volunteer.id) : false;
    const canMatch = volunteer.profile.online
      && !volunteer.profile.busy
      && matchesSkill
      && volunteer.profile.trustLevel !== 'NEW'
      && volunteer.profile.trustLevel !== 'SUSPENDED'
      && volunteer.profile.trustLevel !== 'BANNED'
      && volunteer.profile.riskScore < 70
      && volunteer.profile.seriousReportsCount < 2;
    return canMatch && !isBlocked;
  });
  return available.sort((a, b) => getMatchPriority(b) - getMatchPriority(a))[0];
}

export function createHelpSession(request: MatchRequest, volunteer: Volunteer): HelpSession {
  setVolunteerBusy(volunteer.id, true);
  return {
    id: crypto.randomUUID(),
    helpRequestId: request.id,
    elderUserId: request.elderUserId,
    volunteerId: volunteer.id,
    startedAt: new Date().toISOString(),
    status: 'active',
  };
}

export function finishHelpSession(session: HelpSession): HelpSession {
  setVolunteerBusy(session.volunteerId, false);
  return { ...session, endedAt: new Date().toISOString(), status: 'completed' };
}

export function createStarterMessages(sessionId: string, volunteerId: string): ChatMessage[] {
  return starterMessages.map((text) => createMessage(sessionId, volunteerId, 'system', text));
}

export function createMessage(
  sessionId: string,
  senderId: string,
  messageType: ChatMessage['messageType'],
  text: string,
  file?: { url: string; name: string },
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    sessionId,
    senderId,
    messageType,
    text,
    createdAt: new Date().toISOString(),
    fileUrl: file?.url,
    fileName: file?.name,
  };
}

export function hasSafetyRisk(text: string): boolean {
  return /парол|password|sms|смс|pin|пин|код|банк|карт|деньг|перевед|установи|ссылк|личн/i.test(text);
}

export function createSafetyReport(
  session: HelpSession | undefined,
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  comment: string,
): SafetyReport {
  const severity = getReportSeverity(reason, comment);
  const report: SafetyReport = {
    id: crypto.randomUUID(),
    sessionId: session?.id,
    reporterId,
    reportedUserId,
    reason,
    severity,
    comment,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  safetyReports = [report, ...safetyReports];
  raiseVolunteerRisk(reportedUserId, severity);
  return report;
}

export function blockUser(blockerId: string, blockedUserId: string) {
  if (!blockedPairs.some((item) => item.blockerId === blockerId && item.blockedUserId === blockedUserId)) {
    blockedPairs = [...blockedPairs, { blockerId, blockedUserId }];
  }
  liveVolunteers = liveVolunteers.map((volunteer) =>
    volunteer.id === blockedUserId
      ? { ...volunteer, profile: { ...volunteer.profile, blockedCount: volunteer.profile.blockedCount + 1, riskScore: volunteer.profile.riskScore + 15 } }
      : volunteer,
  );
}

export function getSafetyReports() {
  return safetyReports;
}

export function addXP(volunteer: Volunteer, points: number): Volunteer {
  const xp = volunteer.profile.xp + points;
  const level = calculateLevel(xp);
  const trustLevel = level >= 5 && volunteer.profile.verified ? 'TRUSTED' : level >= 3 && volunteer.profile.verified ? 'VERIFIED' : 'BASIC';
  return { ...volunteer, profile: { ...volunteer.profile, xp, level, trustLevel, peopleHelped: volunteer.profile.peopleHelped + 1 } };
}

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 200) + 1);
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
  safetyReports = [];
  blockedPairs = [];
}

function getMatchPriority(volunteer: Volunteer): number {
  const trustLevelBonus = {
    NEW: -100,
    BASIC: 10,
    VERIFIED: 30,
    TRUSTED: 45,
    SUSPENDED: -200,
    BANNED: -300,
  }[volunteer.profile.trustLevel];
  return volunteer.profile.trustScore
    + trustLevelBonus
    + volunteer.profile.successfulHelpCount * 0.8
    + volunteer.profile.rating * 4
    - volunteer.profile.reportsCount * 12
    - volunteer.profile.seriousReportsCount * 30
    - volunteer.profile.blockedCount * 18
    - volunteer.profile.riskScore;
}

function getReportSeverity(reason: ReportReason, comment: string) {
  const highRiskReason = reason === 'money' || reason === 'password' || reason === 'bank_data' || reason === 'suspicious_app';
  return highRiskReason || hasSafetyRisk(comment) ? 'high' : 'normal';
}

function raiseVolunteerRisk(volunteerId: string, severity: SafetyReport['severity']) {
  liveVolunteers = liveVolunteers.map((volunteer) => {
    if (volunteer.id !== volunteerId) return volunteer;
    const seriousReportsCount = volunteer.profile.seriousReportsCount + (severity === 'high' ? 1 : 0);
    const riskScore = volunteer.profile.riskScore + (severity === 'high' ? 35 : 12);
    return {
      ...volunteer,
      profile: {
        ...volunteer.profile,
        reportsCount: volunteer.profile.reportsCount + 1,
        seriousReportsCount,
        riskScore,
        trustScore: Math.max(0, volunteer.profile.trustScore - (severity === 'high' ? 25 : 8)),
        trustLevel: seriousReportsCount >= 2 ? 'SUSPENDED' : volunteer.profile.trustLevel,
      },
    };
  });
}

function setVolunteerBusy(volunteerId: string, busy: boolean) {
  liveVolunteers = liveVolunteers.map((volunteer) =>
    volunteer.id === volunteerId ? { ...volunteer, status: busy ? 'busy' : 'online', profile: { ...volunteer.profile, busy } } : volunteer,
  );
}
