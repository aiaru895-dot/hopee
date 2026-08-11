import { helpCategories } from '../lib/ryadomData';
import type { Volunteer } from '../lib/ryadomTypes';
import { Avatar } from './RyadomUi';

export function VolunteerCard({ volunteer }: { volunteer: Volunteer }) {
  const labels = volunteer.profile.skills
    .map((skill) => helpCategories.find((category) => category.id === skill)?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <article className="volunteer-card">
      <Avatar value={volunteer.avatar} />
      <div>
        <h2>{volunteer.name}</h2>
        <p>🟢 Сейчас онлайн</p>
        <p>⭐ {volunteer.profile.rating} · помогла {volunteer.profile.peopleHelped} людям</p>
        <p>🌟 {volunteer.profile.title}</p>
        <p>{labels}</p>
      </div>
    </article>
  );
}
