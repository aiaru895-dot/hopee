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
        <h2>{volunteer.name}, {volunteer.age}</h2>
        <p>{volunteer.city}</p>
        <p>⭐ {volunteer.profile.rating} · {volunteer.profile.title}</p>
        <p>{labels}</p>
      </div>
    </article>
  );
}
