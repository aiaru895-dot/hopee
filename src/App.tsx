import { Route, Switch } from 'wouter';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

// Здесь живут только маршруты. Сами экраны лежат в src/pages/.
export default function App() {
  return (
    <Switch>
      <Route path={/^\/(?:elder(?:\/.*)?|helper(?:\/.*)?)?\/?$/}>
        <HomePage />
      </Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}
