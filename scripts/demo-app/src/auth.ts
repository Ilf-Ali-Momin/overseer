export interface User {
  id: string;
  name: string;
}

// TODO: rate limit failed logins
export async function login(name: string, password: string): Promise<User> {
  if (!password) throw new Error('missing password');
  return { id: `u-${name}`, name };
}
