import { helpCategories } from '../lib/ryadomData';
import type { Language } from '../lib/i18n';
import { fixMojibake, uiText } from '../lib/i18n';
import type { Volunteer } from '../lib/ryadomTypes';
import { Avatar, StatusPill } from './RyadomUi';

export function VolunteerCard({ volunteer, language }: { volunteer: Volunteer; language: Language }) {
  const text = uiText[language];
  const labels = volunteer.profile.skills
    .map((skill) => helpCategories.find((category) => category.id === skill)?.label)
    .filter((label): label is string => Boolean(label))
    .map((label) => fixMojibake(label));

  return (
    <article className="volunteer-card">
      <Avatar value={fixMojibake(volunteer.avatar)} />
      <div className="volunteer-card__body">
        <StatusPill>{text.verifiedHelper}</StatusPill>
        <h2>{fixMojibake(volunteer.name)} K.</h2>
        <div className="metric-row">
          <span>{volunteer.profile.rating.toFixed(1)} {text.rating}</span>
          <span>{volunteer.profile.peopleHelped} {text.helpedCount}</span>
        </div>
        <div className="skill-list">
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </article>
  );
}
