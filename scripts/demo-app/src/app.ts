import { login } from './auth';
import { loadTodos, saveTodo } from './todos';

// TODO: show a spinner while todos load
export async function main(): Promise<void> {
  const user = await login('demo', 'demo');
  const todos = await loadTodos(user.id);
  console.log(`Loaded ${todos.length} todos`);
  await saveTodo(user.id, 'Try Overseer');
}
