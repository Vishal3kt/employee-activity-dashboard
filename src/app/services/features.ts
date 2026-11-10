/**
 * Feature switches.
 * Change a value and redeploy to release or hide a feature.
 * Code behind a switch that's off never runs and requests no permissions.
 */
export const FEATURES = {
  /**
   * Live Teams status (Available, Busy, Away, Offline) in the employee list,
   * plus "Available now" and "Away now" cards. Refreshes every 2 minutes.
   *
   * Before setting this to true:
   * 1. In Entra ID → App registrations → API permissions, add Microsoft Graph
   *    delegated permission Presence.Read.All and grant admin consent.
   * 2. Deploy. Each user is sent to sign in once more so the new permission
   *    is added to their session.
   */
  teamsPresence: true,

  /**
   * Count only licensed accounts as employees. Leaves out rooms, shared
   * mailboxes, service accounts and other unlicensed accounts.
   */
  licensedUsersOnly: true,
};

/** Settings for the failed sign-ins view and the Excel security sheets. */
export const SECURITY = {
  /**
   * Countries where your people normally sign in, as two-letter codes,
   * e.g. ['IN'] or ['IN', 'US']. Failures from anywhere else are marked
   * "Unusual country". Leave empty to detect them automatically from
   * successful sign-ins.
   */
  homeCountries: [] as string[],

  /** Mark an IP as "Repeated" after this many suspicious failures. */
  repeatedIpThreshold: 10,

  /** Mark an account as "Repeated" after this many suspicious failures. */
  repeatedAccountThreshold: 5,
};
