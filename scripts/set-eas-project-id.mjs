// Saves the EAS project id into app.json (it isn't a secret). `eas init` can't write it into this project
// automatically because app.config.ts is code, so it prints the id instead; paste it here:
//   node scripts/set-eas-project-id.mjs 1234abcd-....
import fs from 'node:fs';

const id = (process.argv[2] ?? '').trim();
if (!/^[0-9a-f-]{36}$/i.test(id)) {
  console.error('Paste the project id that `eas init` printed, like: node scripts/set-eas-project-id.mjs 1234abcd-12ab-34cd-56ef-1234567890ab');
  process.exit(1);
}
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
app.expo.extra = { ...app.expo.extra, eas: { ...app.expo.extra?.eas, projectId: id } };
fs.writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');
console.log(`Saved. The Index is now linked to EAS project ${id}.`);
