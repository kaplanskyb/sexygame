const admin = require('firebase-admin');
const serviceAccount = require('./path/to/your/serviceAccountKey.json'); // Replace with your key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://sexygame-6e8f3.firebaseio.com" // Replace with your DB URL
});

const db = admin.firestore();
const appId = 'truth-dare-v1';

async function resetAnswered(collectionName) {
  const ref = db.collection(`artifacts/${appId}/public/data/${collectionName}`);
  const snapshot = await ref.get();
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.update(doc.ref, { answered: false });
  });
  await batch.commit();
  console.log(`Reset ${collectionName}`);
}

async function main() {
  await resetAnswered('challenges');
  await resetAnswered('pairChallenges');
}

main().catch(console.error);