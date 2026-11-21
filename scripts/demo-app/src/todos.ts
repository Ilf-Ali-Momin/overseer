export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

const db = new Map<string, Todo[]>();

// TODO: persist todos to disk instead of memory
export async function loadTodos(userId: string): Promise<Todo[]> {
  return db.get(userId) ?? [];
}

export async function saveTodo(userId: string, title: string): Promise<Todo> {
  const list = db.get(userId) ?? [];
  const todo = { id: list.length + 1, title, done: false };
  db.set(userId, [...list, todo]);
  return todo;
}
