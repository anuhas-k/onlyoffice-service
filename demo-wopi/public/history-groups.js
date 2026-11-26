// Groups the version list the way ADR-001 asks for the history view: checkpoints collapsed under the version that closed them.
// Input: versions newest first (as GET /files/:id/versions returns them).
// Output: groups newest first — { head, checkpoints (newest first), inProgress }.
//   head          the non-checkpoint version (milestone, initial, recovered, conflict) that closed the group, or null
//   inProgress    true for the checkpoints newer than the latest head (a session still being edited)
export function groupVersions(versions) {
  const groups = [];
  let run = []; // checkpoints waiting for the version that closes them, oldest first
  for (const version of [...versions].reverse()) {
    if (version.kind === 'checkpoint') {
      run.push(version);
    } else {
      groups.push({ head: version, checkpoints: run.reverse(), inProgress: false });
      run = [];
    }
  }
  if (run.length > 0) groups.push({ head: null, checkpoints: run.reverse(), inProgress: true });
  return groups.reverse();
}
