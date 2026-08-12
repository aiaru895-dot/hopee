import { helpCategories } from '../lib/ryadomData';
import type { Volunteer } from '../lib/ryadomTypes';
import { Avatar, StatusPill } from './RyadomUi';

export function VolunteerCard({ volunteer }: { volunteer: Volunteer }) {
  const labels = volunteer.profile.skills
    .map((skill) => helpCategories.find((category) => category.id === skill)?.label)
    .filter(Boolean);

  return (
    <article className="volunteer-card">
      <Avatar value={volunteer.avatar} />
      <div className="volunteer-card__body">
        <StatusPill>Проверенный помощник</StatusPill>
        <h2>{volunteer.name} К.</h2>
        <div className="metric-row">
          <span>{volunteer.profile.rating.toFixed(1)} рейтинг</span>
          <span>{volunteer.profile.peopleHelped} помощи</span>
        </div>
        <div className="skill-list">
          {labels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </article>
  );
}
