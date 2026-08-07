const KEY = "mesa-demo-session";

export function signIn(email: string) {
  window.localStorage.setItem(KEY, email);
}

export function signOut() {
  window.localStorage.removeItem(KEY);
}

export function getSession(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}
