// Where to send someone who isn't signed in. Key holders are the common visitor,
// so they go to the public usage check; a browser that has signed in as admin
// before goes to the login page instead. This is only a convenience for routing,
// not access control: the admin API still requires the password session.

const KEY = "outline-admin:admin-device";

export function rememberAdminDevice() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Private mode or blocked storage: the admin can still open /login directly.
  }
}

function isAdminDevice() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** `here` is the path the visitor was trying to open. */
export function signedOutPath(here: string) {
  if (here.startsWith("/login")) return here;
  return isAdminDevice() ? `/login?next=${encodeURIComponent(here)}` : "/check";
}
