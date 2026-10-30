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
