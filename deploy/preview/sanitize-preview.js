// This script runs only against the disposable MongoDB container created for
// one PR. It preserves ObjectIds so all existing references continue to work,
// while removing credentials and outbound integration secrets from the copy.

const users = db.users.find({}, { _id: 1 }).toArray();
for (const user of users) {
  const id = String(user._id);
  db.users.updateOne(
    { _id: user._id },
    {
      $set: {
        email: `preview-${id}@preview.invalid`,
        status: 'approved',
      },
      $unset: {
        passwordHash: '',
        githubId: '',
        discordId: '',
      },
    },
  );
}

// The copy may be used to exercise leaderboard/config flows, but it must not
// retain credentials that could also authenticate requests to production.
db.games.updateMany(
  {},
  {
    $set: {
      discordWebhookUrl: '',
      'serverBackend.leaderboardEnabled': false,
      'serverBackend.configEnabled': false,
    },
    $unset: {
      'serverBackend.secret': '',
    },
  },
);

db.sitesettings.updateMany(
  {},
  {
    $set: { geminiKeyLast4: '' },
    $unset: { geminiApiKey: '' },
  },
);

const previewUser = db.users.findOne({ role: 'admin' }) || db.users.findOne({});
if (previewUser) {
  db.users.updateOne(
    { _id: previewUser._id },
    { $set: { role: 'admin', status: 'approved', ageConfirmedAt: new Date() } },
  );
  print(`PREVIEW_USER_ID=${previewUser._id}`);
} else {
  print('PREVIEW_USER_ID=');
}
